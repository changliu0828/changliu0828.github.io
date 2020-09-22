---
title: "libco源码笔记(2)主要结构与函数"
date: 2020-09-22T16:18:17+08:00
toc: true
categories:
  - 源码笔记 
tags:
  - libco
---

在之前的文章[libco源码笔记(1)协程与上下文切换](http://www.changliu.me/post/libco-coroutine/)中，我们介绍了协程的基本概念以及libco中的上下文切换核心代码。本文结合一个示例，介绍libco提供的几个重要函数接口。

# libco主要结构体

首先我们介绍一些libco中的三个核心结构体，下图1中描述了三者的关系，

`coctx_t`保存协程切换时所需的上下文信息，详尽的说明请参考[libco源码笔记(1)协程与上下文切换](http://www.changliu.me/post/libco-coroutine/)，此处不再说明。

`stCoRoutine_t`为协程主要结构体，包含单个协程所需一切信息，如协程启停状态，执行函数，上下文信息，共享栈信息等。


`stCoRoutineEnv_t`为线程私有全局静态变量，包含全局协程环境信息，如协程调用栈，epoll句柄等。

```cpp
static __thread stCoRoutineEnv_t* gCoEnvPerThread = NULL;   //协程运行环境 __thread:线程私有
```

{{< figure src="/image/libco-coroutine/co-core-struct.png" width="100%" caption="图1. libco核心结构">}}

{{< figure src="/image/libco-coroutine/libco-uml.svg" width="100%" caption="图1. libco核心结构">}}

```

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
int   co_create( stCoRoutine_t **co,const stCoRoutineAttr_t *attr,void *(*routine)(void*),void *arg );
```

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


