---
title: "libco与协程栈"
date: 2020-09-22T16:21:55+08:00
draft: true
---


# 协程栈的两种模式

我们不难发现，上述的协程上下文切换过程中，协程栈的大小是受限于`ss_size`的。而这块内存在调用`co_create`创建每个协程时，malloc提前分配的。我们称这种模式为私有栈模式(stackless)。这种模式的优势在于上下文切换时开销很低，只需要寄存器的切换即可。但缺点也很明显，预先分配的内存（libco中默认为128K）限制了栈的大小，同样也会导致内存空间的大量浪费。
