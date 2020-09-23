---
title: "libco源码笔记(2)主要结构与函数"
date: 2020-09-22T16:18:17+08:00
toc: true
categories:
  - 源码笔记 
tags:
  - libco
---

在之前的文章[libco源码笔记(1)协程与上下文切换](http://www.changliu.me/post/libco-coroutine/)中，我们介绍了协程的基本概念以及libco中的上下文切换核心代码。本文结合一个示例，介绍libco提供的几个重要函数接口。建议配合我自己的[注释版本](https://github.com/changliu0828/libco)阅读。

# libco主要结构体

首先我们介绍一些libco中的三个核心结构体，下图1中描述了三者的关系，

## `coctx_t`

保存协程切换时所需的上下文信息，详尽的说明请参考[libco源码笔记(1)协程与上下文切换](http://www.changliu.me/post/libco-coroutine/)，此处不再说明。

## `stCoRoutine_t`

协程主要结构体，包含单个协程的全部信息，如协程启停状态，执行函数，上下文信息，共享栈信息等。

## `stCoRoutineEnv_t`

```cpp
static __thread stCoRoutineEnv_t* gCoEnvPerThread = NULL;   //协程运行环境 __thread:线程私有
```

线程私有全局静态变量，包含全局协程环境信息，如协程调用栈，epoll句柄等。其中`pCallStack`为当前线程中的协程调用栈，由于libco为非对称协程

{{< figure src="/image/libco-api/co-core-struct.svg" width="100%" caption="图1. libco核心结构">}}


# libco主要接口函数

```cpp
/*  协程创建接口
 *  @param
 *  co          :协程主结构体二级指针
 *  attr        :协程可配置属性, 包括栈大小、共享栈地址
 *  pfn         :协程调用函数
 *  arg         :协程调用函数参数
 *  @return     :0
 */
int co_create( stCoRoutine_t **ppco,const stCoRoutineAttr_t *attr,pfn_co_routine_t pfn,void *arg )
{
    if( !co_get_curr_thread_env() ) 
    {
        co_init_curr_thread_env();      //初始化本线程环境，主协程才会调用
    }
    stCoRoutine_t *co = co_create_env( co_get_curr_thread_env(), attr, pfn,arg );   //创建协程运行环境, 初始化协程数据
    *ppco = co;
    return 0;
}
```

`co_create`主要负责两件事情。首先，在当前线程没有初始化运行环境`stCoRoutineEnv_t`时，对其进行初始化，包括初始化协程调用栈，创建主协程并压栈等。其次，根据传入的配置参数`attr`创建协程，分配私有栈（设置共享栈）并返回句柄`co`。

```cpp
/*  协程切回接口
 *  @param
 *  co          :协程主结构体指针
 */
void co_resume( stCoRoutine_t *co )
{
    stCoRoutineEnv_t *env = co->env;
    stCoRoutine_t *lpCurrRoutine = env->pCallStack[ env->iCallStackSize - 1 ];  //当前正在运行的协程
    if( !co->cStart )                                                           //第一次进入
    {
        coctx_make( &co->ctx,(coctx_pfn_t)CoRoutineFunc,co,0 );                 //在co->ctx中保存上下文(当前寄存器)
        co->cStart = 1;                                                         //标记为已开始
    }
    env->pCallStack[ env->iCallStackSize++ ] = co;                              //压入协程调用栈
    co_swap( lpCurrRoutine, co );                                               //切换
}
```

`co_resume`负责切换至某一协程。在`co`没有启动时通过`coctx_make`初始化协程栈，并将协程压栈，并与当前协程进行上下文切换。


```cpp
void co_yield_env( stCoRoutineEnv_t *env )
{
    
    stCoRoutine_t *last = env->pCallStack[ env->iCallStackSize - 2 ];
    stCoRoutine_t *curr = env->pCallStack[ env->iCallStackSize - 1 ];

    env->iCallStackSize--;

    co_swap( curr, last);
}
/* 当前协程切出接口
 */
void co_yield_ct()
{
    co_yield_env( co_get_curr_thread_env() );
}
/*  协程切出接口
 *  @param
 *  co          :协程主结构体指针
 */
void co_yield( stCoRoutine_t *co )
{
    co_yield_env( co->env );
}
```

`co_yield`系列函数负责当前线程让出CPU，将其出栈，并与栈上的前一个协程进行上下文切换。

# 示例

```cpp
//example_test.cpp
#include <stdio.h>
#include <stdlib.h>
#include "co_routine.h"

void* f(void* args) {
    while (1) {
        printf("f\n");
        co_yield_ct();
    }
    return NULL;
}
void* g(void* args) {
    while (1) {
        printf("g\n");
        co_yield_ct();
    }
    return NULL;
}
int main() {
    stCoRoutine_t* co_f;
    stCoRoutine_t* co_g;
    co_create(&co_f, NULL, f, NULL); 
    co_create(&co_g, NULL, g, NULL); 
    while(1) {
        co_resume(co_f);
        co_resume(co_g);
    }
    return 0;
}
```

使用上面提到的三个基本函数，我在这里写了一个小例子，程序创建了两个协程`f`和`g`，没个协程在打印自己的函数名后，让出CPU。主协程循环调用`resume`调用两个协程，程序的运行输出为循环打印
```bash
./example_test
f
g
f
...
```
# 最后

至此，我们了解了libco核心部分的相关函数与执行过程。感谢你的阅读。如果你你有任何疑虑和感想，或发现本文有任何错误，请一定[让我知道](mailto:changliu0828@gmail.com)。

# 参考

1. [libco源码分析，csdn](https://blog.csdn.net/weixin_43705457/article/details/106863859)
2. [libco分享，李方源](http://purecpp.org/purecpp/static/64a819e99584452aab70a7f9c307717f.pdf)
