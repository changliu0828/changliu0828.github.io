---
title: "libco与协程"
date: 2020-09-11T15:08:21+08:00
categories:
  - 源码笔记 
tags:
  - libco
---

# 回调地狱(callback hell)

在正式开始聊协程之前，容我们简单回顾下协程之所以产生的原因。

起初，如下图(a)中所示，我们的系统中有源源不断的任务(图中的task)需要处理。为此我们编写了一个服务端程序。这个程序以单进程方式运行(图中的process)，并无限循环的尽可能获取任务（图中loop）。对于获取到的每个人物，调用处理函数 `f()` 完成具体处理逻辑。特别的，对于函数 `f()` 来讲，代码片段 `g()` 消耗了比较长的时间。但尽管如此，系统外部任务的产生频率还是比 `f()` 的运行时间低，即系统对任务的消费能力高于任务的生产能力，我们的服务运转良好。 

然而随着业务的发展，我们单位时间内接受的任务越来越多，(a)中的单进程单线程服务模式已经无法及时消费任务。为此，如下图(b)中所示，我们可以将功能较为独立，消耗资源较大的 `g()` 部分抽离为单独的进程。原进程使用异步方式 `call_g()` 调用`g()`，并注册回调函数 `g_callback()` 处理 `g()` 的返回。在编码时，我们需要将原有顺序的编程方式改为调用部分加回调部分的编程方式。

![server-model.png](/image/libco-coroutine/server-model.png)