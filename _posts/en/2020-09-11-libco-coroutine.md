---
title: "libco Source Notes (1): Coroutines and Context Switching"
layout: post
ref: libco-coroutine
---
# libco Source Notes (1): Coroutines and Context Switching

This post uses WeChat's high-performance open-source coroutine library [libco](https://github.com/Tencent/libco) to summarize the problems coroutines address and how they solve them. libco has few source comments, so here is [my own annotated version](https://github.com/changliu0828/libco). I suggest reading this post together with it. All code and explanations here run on x86 32-bit. The 64-bit case differs slightly. I skip it for space.


## Callback Hell

Before we start, let's briefly recall why coroutines exist.

At first, as in Figure 1(a) below, our system has a steady stream of tasks (task in the figure) to process. We write a server program for it. The program runs as a single process (process in the figure) and keeps fetching tasks (loop in the figure). For each task it fetches, it calls the handler `f()` to run the actual logic. In `f()`, the code segment `g()` takes a long time. Even so, tasks arrive less often than `f()` takes to run. The system consumes tasks faster than they are produced, so the service runs fine.

As the business grows, we receive more tasks per unit of time. The single-process model in (a) can no longer consume tasks in time. So, as in Figure 1(b), we can split `g()` out into its own process, since it is fairly independent and uses many resources. The original process calls `g()` with an asynchronous remote call `call_g()`. It registers a callback `g_callback()` to handle the result of `g()`. When coding, we have to change from sequential programming to programming with a calling part and a callback part.

![Figure 1](/assets/images/libco-coroutine/server-model.png){: width="100%" }
*Figure 1*

The asynchronous style raises system throughput and lowers coupling. But as the figure below shows, one sequential piece of code is split into several pieces. When the code is complex and needs many remote calls, maintainability drops sharply. We call this **callback hell**.

![Figure 2. Code segments under synchronous and asynchronous programming](/assets/images/libco-coroutine/callback-hell.png){: width="50%" }
*Figure 2. Code segments under synchronous and asynchronous programming*

## What Is a Coroutine

How do we solve callback hell? How do we keep execution asynchronous, yet turn the broken-up code back into the sequential flow we know? When C/C++ code runs, almost all of the runtime state is held in stack frames and registers. Suppose a remote call blocks. If we save the execution context ourselves, give up the CPU, and load the context again when the remote call returns, we can finish the asynchronous process inside one function stack. We call this mechanism a **coroutine**. It is like the process/thread switching we know, but the user triggers the context switch and manages it. So it is also often called a "user-space thread".

![Figure 3. Responsibilities of a coroutine library](/assets/images/libco-coroutine/co-lib.png){: width="90%" }
*Figure 3. Responsibilities of a coroutine library*

## Coroutine Context and Switching

What exactly is in the runtime "context" that we must save and load by hand? Take the following `main` function calling the `sum` function as an example:

```cpp
int sum(int x, int y) {
  int z = x + y;
  return z;
}
int main() {
  int a = 1;
  int b = 10;
  int c = sum(a, b);
  return 0;
}
```

After compiling with `g++ -m32 -S sum.cpp`, the assembly is as follows:

```nasm
_Z3sumii:
pushl   %ebp
movl    %esp, %ebp
subl    $16, %esp         ;make space for stack
movl    12(%ebp), %eax    ;%eax = y
movl    8(%ebp), %edx     ;%edx = x
addl    %edx, %eax        ;%eax = %eax + %edx
movl    %eax, -4(%ebp)    ;z = %eax
movl    -4(%ebp), %eax    ;%eax = z
leave                     ;%esp = %ebp; pop %ebp
ret                       ;pop %eip; jump(%eip)

main:
pushl   %ebp
movl    %esp, %ebp
subl    $24, %esp         ;make space for stack
movl    $1, -4(%ebp)      ;int a = 1;
movl    $10, -8(%ebp)     ;int b = 10;
movl    -8(%ebp), %eax
movl    %eax, 4(%esp)     ;y = b;
movl    -4(%ebp), %eax
movl    %eax, (%esp)      ;x = a;
call    _Z3sumii          ;push(eip); jump(sum);
movl    %eax, -12(%ebp)
movl    $0, %eax          ;return 0;
```

As the figure below shows, the code mainly works on the stack frames of the two functions, shown in yellow and green. The base pointer register `ebp` and the stack pointer register `esp` mark the bottom and the top of the stack.

$L14$ first pushes the current `ebp`. Since `main` is the function that runs right after the process starts, `ebp` is 0 here.

$L15$ sets the `ebp` position for `main`.

$L16$ moves the `esp` address down by 16. This makes enough room for the local variables and the arguments of the `sum` call.

$L17-L22$ assign values to the variables `a,b` and to the arguments `x,y` of `sum`.

$L23$ runs the `call` instruction. It pushes the current instruction register `eip` and jumps to `sum` (`eip` points to the first instruction of `sum`).

$L2$ pushes the current `ebp`, which is `ebp_main` in the figure.

$L3$ sets the `ebp` position for `sum`, pointing at the current `esp`.

$L4$ makes room on the stack.

$L5, L6$ use `ebp_sum + 8, ebp_sum + 12` to get the values of the arguments `x, y`.

$L7-L9$ do the addition and put the result in `eax`.

$L10$ calls the `leave` instruction. It moves `esp` back to the `ebp` position, pops `ebp_main`, and assigns it to `ebp`.

$L11$ calls the `ret` instruction. It pops the instruction address `eip` saved before the call to `sum` and assigns it to `eip`. Now the stack of `main`, the yellow part in the figure, is restored.

Line $L24$ assigns the result of `sum` in `eax` to `c`.

Line $L25$ assigns the return value `0` to `eax`. This finishes the whole process.

![Figure 4. Function stack of sum.cpp](/assets/images/libco-coroutine/function-call-example.png){: width="60%" }
*Figure 4. Function stack of sum.cpp*

From this analysis, we can see that for a running function, **arguments, return address, function stack, and registers** make up all of its runtime information. With them, we can restore the execution state of any function. We call this the **coroutine context**.

### `coctx_t` Context Information

libco describes the coroutine context with the structure `coctx_t` defined below. `ss_sp` and `ss_size` hold the arguments, the return address, and the function stack. These are the red-box part of Figure 4. `regs` holds the registers for 32-bit/64-bit:

```cpp
struct coctx_t
{
#if defined(__i386__)
  void *regs[ 8 ];    //see coctx.cpp for details
#else
  void *regs[ 14 ];   //see coctx.cpp for details. R10, R11 are callee saved registers, saved by the called function
#endif
  size_t ss_size;     //remaining size of the coroutine stack
  char *ss_sp;        //bottom address of the coroutine stack
};
```

### `co_make` Context Initialization

libco uses the `coctx_make` below to fill in the initial content of the coroutine context on the first call (`co_resume`):

```cpp
/*
 * @param
 * ctx  :pointer to the context struct
 * pfn  :pointer to the function to call
 * s    :argument
 * s1   :argument
 */
int coctx_make(coctx_t* ctx, coctx_pfn_t pfn, const void* s, const void* s1) {
  // make room for coctx_param
  char* sp = ctx->ss_sp + ctx->ss_size - sizeof(coctx_param_t); //ss_sp is heap memory, move sp to the high address
  sp = (char*)((unsigned long)sp & -16L);                       //i386 requires the stack start address to be 16-byte aligned

  coctx_param_t* param = (coctx_param_t*)sp;
  void** ret_addr = (void**)(sp - sizeof(void*) * 2);           //return address
  *ret_addr = (void*)pfn;
  param->s1 = s;
  param->s2 = s1;

  memset(ctx->regs, 0, sizeof(ctx->regs));

  ctx->regs[kESP] = (char*)(sp) - sizeof(void*) * 2;
  return 0;
}
```

Figure 5 below shows the coroutine stack after `co_make` fills it. It differs from the function call stack above. Before the arguments and the return address, 4 bytes are left empty (NULL in the figure). This prepares for the later context switch.

![Figure 5. co_make initializes the coroutine stack](/assets/images/libco-coroutine/co_make.png){: width="60%" }
*Figure 5. co_make initializes the coroutine stack*

### `coctx_swap` Context Switching

```cpp
extern "C"
{
  extern void coctx_swap( coctx_t *,coctx_t* ) asm("coctx_swap");
};
```

libco switches coroutine contexts with the `coctx_swap` function. It takes two `coctx_t *` arguments. The first points to where the current coroutine context is saved. The second points to the context to switch in:

```nasm
.globl coctx_swap
coctx_swap:
    movl 4(%esp), %eax              ;eax = *(esp+4) get the first argument coctx_t
    movl %esp, 28(%eax)             ;coctx_t.regs[7] = esp 
    movl %ebp, 24(%eax)             ;coctx_t.regs[6] = ebp
    movl %esi, 20(%eax)             ;coctx_t.regs[5] = esi
    movl %edi, 16(%eax)             ;coctx_t.regs[4] = edi
    movl %edx, 12(%eax)             ;coctx_t.regs[3] = edx
    movl %ecx, 8(%eax)              ;coctx_t.regs[2] = ecx
    movl %ebx, 4(%eax)              ;coctx_t.regs[1] = ebx

    movl 8(%esp), %eax              ;eax = *(esp+8) get the second argument coctx_t
    movl 4(%eax), %ebx              ;ebx = coctx_t.regs[1] 
    movl 8(%eax), %ecx              ;ecx = coctx_t.regs[2] 
    movl 12(%eax), %edx             ;edx = coctx_t.regs[3]            
    movl 16(%eax), %edi             ;edi = coctx_t.regs[4] 
    movl 20(%eax), %esi             ;esi = coctx_t.regs[5] 
    movl 24(%eax), %ebp             ;ebp = coctx_t.regs[6] 
    movl 28(%eax), %esp             ;esp = coctx_t.regs[7] 

  ret
```

Use the figure below as a reference. The stack before calling `coctx_swap` is the green part. The `call` instruction pushes the return address.

At $L3$, `esp` is at the position shown in the figure, and we enter the `coctx_swap` function.

$L3-L10$ save the register values into the `coctx_t` pointed to by the first argument.

$L12-L19$ read the information in the `coctx_t` pointed to by the second argument into the registers. This restores the context.

The `ret` instruction at $L21$ pops `eip`, the entry of the function `pfn`, and jumps to `pfn`. Now the yellow stack is built as the stack space before calling pfn (compare with the yellow part in the red box of Figure 4). The `NULL` reserved earlier is exactly what the `ret` instruction needs here.

![Figure 6. coctx_swap context switching](/assets/images/libco-coroutine/coctx_swap.png){: width="90%" }
*Figure 6. coctx_swap context switching*

## Symmetric and Asymmetric Coroutines

Above, we saw how two coroutines switch contexts. For scheduling the coroutines, there are two main ways, as the figure below shows: symmetric coroutines and asymmetric coroutines.

In symmetric coroutines, all coroutines run as equals. They call `transfer` to jump freely between each other.

Asymmetric coroutines work like a coroutine call stack. At the start, only the main coroutine is on the stack. Calling `resume` pushes another coroutine onto the stack and switches to its context. When a coroutine finishes, or calls `yield` explicitly, it is popped and we switch back to the previous coroutine context. Usually the coroutine call stack is not deep. In practice, most switching is between the main coroutine (IO) and logic coroutines.

In real applications, symmetric coroutines cost more to maintain, and it is hard to keep track of the call chain. So asymmetric coroutines are more common. The libco described here is an asymmetric coroutine library.

![Figure 7. Symmetric/asymmetric coroutines](/assets/images/libco-coroutine/symmetric-asymmetric-co.png){: width="100%" }
*Figure 7. Symmetric/asymmetric coroutines*

## Private Stack and Shared Stack

From the `coctx_make` code above, we can see that the coroutine stack in libco is about `ss_size` in size. By default, when you call `co_create` to create a new coroutine in libco, it allocates `ss_size` of 128K on the heap and points `ss_sp` at it. Each coroutine then has its own stack space. This is called the "private stack" mode, also called stackful mode. In private stack mode, a context switch only needs to save and load registers, so the cost is low. But each coroutine's stack size is fixed, so a lot of stack space is wasted.

In contrast to the private stack, libco offers a shared stack mode, also called stackless mode. In a shared stack, all coroutines use one fixed-size block of stack space (128K by default in libco). When a coroutine switches out, libco uses `malloc` to get a block of memory sized to the stack currently in use, and copies the shared stack content out to it. This uses memory more sensibly, but a context switch costs more.

## Conclusion

So far, we have used the libco source to cover context switching, the core part of coroutines. Thank you for reading. If you have any questions or thoughts, or find any mistake in this post, please [let me know](mailto:changliu0828@gmail.com).

## References

1. [libco source code analysis, csdn (in Chinese)](https://blog.csdn.net/weixin_43705457/article/details/106863859)
2. [libco talk, Li Fangyuan (in Chinese)](http://purecpp.org/purecpp/static/64a819e99584452aab70a7f9c307717f.pdf)

