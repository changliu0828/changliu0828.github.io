---
title: "libco源码笔记(3)自动切换"
date: 2020-09-23T16:28:30+08:00
toc: true
categories:
  - 源码笔记 
tags:
  - libco
---

在之前的文章[libco源码笔记(2)显示切换](http://www.changliu.me/post/libco-manual/)中，我们介绍了libco提供的显示协程切换接口，并讨论了协程池的使用。本文讨论libco提供的自动切换相关函数接口。建议配合我自己的[注释版本](https://github.com/changliu0828/libco)阅读本文。


# 自动切换的背景

李方源的libco分享$^{[2]}$中讲到，使用libco之前，微信的大多的网络通信使用同步IO接口。为了快速改造现有业务代码，libco已hook系统调用的形式，提供了协程基础上的`poll`，`read`，`write`等原语。利用协程的特性，原来阻塞的系统调用可以达到非阻塞的效果。

# 超时管理

libco为了对统一网络IO，条件变量需要超时管理的事件，实现了基于时间轮(timeing-wheel)的超时管理器。在介绍其对系统调用的hook前，容我们先铺垫一些关于这个超时管理器的实现。

{{< figure src="/image/libco-auto/timing-wheel.png" width="100%" caption="图1. 超时管理">}}

```cpp
/* 在时间轮中插入新项
 * @param 
 * apTimeout :时间轮结构
 * apItem    :新的超时项
 * allNow    :当前事件(timestamp in ms)
 * @return   :0成功, else失败行数
 */
int AddTimeout( stTimeout_t *apTimeout,stTimeoutItem_t *apItem ,unsigned long long allNow );
/* 在时间轮中取出所有超时项
 * @param 
 * apTimeout:时间轮结构
 * allNow   :当前时间(timestamp in ms)
 * apResult :超时事件结果链表
 */
inline void TakeAllTimeout( stTimeout_t *apTimeout,unsigned long long allNow,stTimeoutItemLink_t *apResult );
```


# poll

```cpp
struct pollfd {
  int   fd;         /* file descriptor */
  short events;     /* requested events */
  short revents;    /* returned events */
};
int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

原始的`poll`函数以`pollfd`数组的形式传入fd以及关注的事件`events`(读写等)，并返回相应的时间于`revents`。此外`poll`支持毫秒级别的超时设置，当`timeout`设置为正整数或-1(永久)时，线程会阻塞于poll直到有对应事件发生或超时。

libco所hook后的poll可以在IO协程阻塞时让出上下文，切换至主协程。下面是其实现。

```cpp
int poll(struct pollfd fds[], nfds_t nfds, int timeout)
{
  HOOK_SYS_FUNC( poll );

  if (!co_is_enable_sys_hook() || timeout == 0) {         //如果没开启hook系统调用或超时时间为0, 调用原生poll
    return g_sys_poll_func(fds, nfds, timeout);
  }
    //合并fds中相同项
  pollfd *fds_merge = NULL;
  nfds_t nfds_merge = 0;
  std::map<int, int> m;  // fd --> idx
  std::map<int, int>::iterator it;
  if (nfds > 1) {
    fds_merge = (pollfd *)malloc(sizeof(pollfd) * nfds);    //分配nfds个，合并后可能会有多余的
    for (size_t i = 0; i < nfds; i++) {
      if ((it = m.find(fds[i].fd)) == m.end()) { 
        fds_merge[nfds_merge] = fds[i];
        m[fds[i].fd] = nfds_merge;
        nfds_merge++;
      } else {                                    //存在相同项
        int j = it->second;
        fds_merge[j].events |= fds[i].events;   // merge in j slot
      }
    }
  }

  int ret = 0;
  if (nfds_merge == nfds || nfds == 1) {              //没有合并过
    ret = co_poll_inner(co_get_epoll_ct(), fds, nfds, timeout, g_sys_poll_func);
  } else {
    ret = co_poll_inner(co_get_epoll_ct(), fds_merge, nfds_merge, timeout,
        g_sys_poll_func);
    if (ret > 0) {                                  //将合并的还原
      for (size_t i = 0; i < nfds; i++) {
        it = m.find(fds[i].fd);
        if (it != m.end()) {
          int j = it->second;
          fds[i].revents = fds_merge[j].revents & fds[i].events;
        }
      }
    }
  }
  free(fds_merge);
  return ret;
}
```

其中，主要部分代码是处理传入`pollfd`数组中相同fd的事件合并和还原。代码中的核心部分为`co_poll_inner`。

```cpp

```

# co_eventloop



# 参考

1. [libco源码分析，csdn](https://blog.csdn.net/weixin_43705457/article/details/106863859)
2. [libco分享，李方源](http://purecpp.org/purecpp/static/64a819e99584452aab70a7f9c307717f.pdf)

