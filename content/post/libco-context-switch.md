---
title: "libco中的上下文切换"
date: 2020-09-09T16:38:19+08:00
draft: true
categories:
  - CodeNotes
tags:
  - libco
---

# 函数调用栈

# 上下文信息

```cpp
struct coctx_t
{
#if defined(__i386__)
	void *regs[ 8 ];    //详见coctx.cpp
#else
	void *regs[ 14 ];   //详见coctx.cpp, R10, R11为callee saved register, 由被调用函数保存
#endif
	size_t ss_size;     //协程栈剩余大小
	char *ss_sp;        //协程栈栈底地址
};
```

# 上下文切换

```cpp
extern "C"
{
	extern void coctx_swap( coctx_t *,coctx_t* ) asm("coctx_swap");
};
```

```asm
coctx_swap:

#if defined(__i386__)
    movl 4(%esp), %eax              ;eax = *(esp+4) 取第一个参数coctx_t
    movl %esp,  28(%eax)            ;coctx_t.regs[7] = esp
    movl %ebp, 24(%eax)             ;coctx_t.regs[6] = ebp
    movl %esi, 20(%eax)             ;coctx_t.regs[5] = esi
    movl %edi, 16(%eax)             ;coctx_t.regs[4] = edi
    movl %edx, 12(%eax)             ;coctx_t.regs[3] = edx
    movl %ecx, 8(%eax)              ;coctx_t.regs[2] = ecx
    movl %ebx, 4(%eax)              ;coctx_t.regs[1] = ebx


    movl 8(%esp), %eax              ;eax = *(esp+8) 取第二个参数coctx_t
    movl 4(%eax), %ebx              ;ebx = coctx_t.regs[1]
    movl 8(%eax), %ecx              ;ecx = coctx_t.regs[2]
    movl 12(%eax), %edx             ;edx = coctx_t.regs[3]
    movl 16(%eax), %edi             ;edi = coctx_t.regs[4]
    movl 20(%eax), %esi             ;esi = coctx_t.regs[5]
    movl 24(%eax), %ebp             ;ebp = coctx_t.regs[6]
    movl 28(%eax), %esp             ;esp = coctx_t.regs[7]

	ret
```



