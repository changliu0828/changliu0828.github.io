---
title: "libco源码笔记(3)自动切换"
date: 2020-09-23T16:28:30+08:00
toc: true
comments: true
categories:
  - 源码笔记 
tags:
  - libco
---

在之前的文章[libco源码笔记(2)显示切换](http://www.changliu.me/post/libco-manual/)中，我们介绍了libco提供的显示协程切换接口，并讨论了协程池的使用。本文讨论libco提供的自动切换相关函数接口。建议配合我自己的[注释版本](https://github.com/changliu0828/libco)阅读本文。

<!--more-->

# 自动切换的背景

李方源的libco分享$^{[2]}$中讲到，使用libco之前，微信的大多的网络通信使用同步IO接口。为了快速改造现有业务代码，libco以hook系统调用的形式，提供了协程基础上的`poll`，`read`，`write`等原语。利用协程的特性，原来阻塞的系统调用可以达到非阻塞的效果。

# 超时管理

libco为了对统一网络IO，条件变量需要超时管理的事件，实现了基于时间轮(timing wheel)的超时管理器。在介绍其对系统调用的hook前，容我们先铺垫一些关于这个超时管理器的实现。

如下图1所示，时间轮为图中深红色的轮状数组，数组的每一个单元我们称为一个槽(slot)。单个slot里存储一定时间内注册的事件列表（图中黄色链表）。在libco中，单个slot的精度为1毫秒，整个时间轮由60000个slot组成，对应的整个时间轮覆盖60秒的时间。libco中关于时间轮的接口函数主要是下面两个。

`AddTimeout`通过计算当前时间`allNow`与时间轮起始时间`ullStart`的差，插入对应slot。特别注意的是当超时事件大于轮长60秒时，libco将这种事件插入到“最后一个"slot。

`TakeAllTimeout`通过计算当前时间`allNow`与时间轮起始时间`ullStart`的差，得出对应slot，遍历从起始索引`ullStartIdx`所指slot到其的所有slot中的超时项并移动到结果链表`apResult`中。

至此，我们看到通过时间轮，libco得以高效的完成对超时事件的管理。


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

{{< figure src="/image/libco-auto/timing-wheel.png" width="100%" caption="图1. 超时管理">}}

# 事件循环

libco通过epoll管理IO事件，通过`co_eventloop`触发IO事件，并切换至对应协程执行。我们回顾之前提到过的表示协程运行环境的线程私有全局变量`stCoRoutineEnv_t`中，持有epoll的结构体句柄`pEpoll`。

```cpp
struct stCoRoutineEnv_t
{
  stCoRoutine_t *pCallStack[ 128 ];   //所有协程的调用栈
  int iCallStackSize;                 //pCallStack栈顶索引
  stCoEpoll_t *pEpoll;                //epoll封装

  //for copy stack log lastco and nextco
  stCoRoutine_t* pending_co;           
  stCoRoutine_t* occupy_co;           //当前协程
};
```
`stCoEpoll_t`的定义如下，

```cpp
struct stCoEpoll_t
{
  int iEpollFd;                                   //EpollFd
  static const int _EPOLL_SIZE = 1024 * 10;       //epoll_wait单次最大返回事件数量
  struct stTimeout_t *pTimeout;                   //时间轮, 超时管理
  struct stTimeoutItemLink_t *pstTimeoutList;     //已超时项链表
  struct stTimeoutItemLink_t *pstActiveList;      //已就绪项链表  
  co_epoll_res *result;                           //epoll_wait结果
};
```

主事件循环代码如下，

$L11$阻塞在`epoll_wait`上，并设置超时时间为1毫秒。这里的`epoll_wait`并没有经过hook，为系统原生。

$L13-L29$取出所有的`result->events`的事件，执行预处理函数`pfnPrepare`，并加入`active`链表。

$L32-L42$取出所有超时时间并加入`active`链表。

$L59$对所有的`active`链表中事件调用处理函数`pfnProcess`。

$L66$检查是否需要退出事件循环。

```cpp
/* 事件循环
 * @param 
 * ctx:epoll句柄
 * pfn:退出事件循环检查函数
 * arg:pfn参数
 */
void co_eventloop( stCoEpoll_t *ctx,pfn_co_eventloop_t pfn,void *arg )
{
  if( !ctx->result )
  {
    ctx->result =  co_epoll_res_alloc( stCoEpoll_t::_EPOLL_SIZE );
  }
  co_epoll_res *result = ctx->result; 

  for(;;)
  {
    int ret = co_epoll_wait( ctx->iEpollFd,result,stCoEpoll_t::_EPOLL_SIZE, 1 );

    stTimeoutItemLink_t *active = (ctx->pstActiveList);
    stTimeoutItemLink_t *timeout = (ctx->pstTimeoutList);

    memset( timeout,0,sizeof(stTimeoutItemLink_t) );  //清空超时队列

    for(int i=0;i<ret;i++)  //遍历有事件的fd
    {
      stTimeoutItem_t *item = (stTimeoutItem_t*)result->events[i].data.ptr; //获取event里数据指向的stTimeoutItem_t
      if( item->pfnPrepare )  //如果有预处理函数，执行，由其加入就绪列表
      {
        item->pfnPrepare( item,result->events[i],active );
      }
      else  //手动加入就绪列表
      {
        AddTail( active,item );
      }
    }

    unsigned long long now = GetTickMS();
    TakeAllTimeout( ctx->pTimeout,now,timeout );  //将超时项插入超时列表

    stTimeoutItem_t *lp = timeout->head;
    while( lp )
    {
      //printf("raise timeout %p\n",lp);
      lp->bTimeout = true;  //设置为超时
      lp = lp->pNext;
    }

    Join<stTimeoutItem_t,stTimeoutItemLink_t>( active,timeout );  //将超时列表合并入就绪列表

    lp = active->head;
    while( lp )
    {

      PopHead<stTimeoutItem_t,stTimeoutItemLink_t>( active );
            if (lp->bTimeout && now < lp->ullExpireTime)  //还未达到超时时间但已经标记为超时的，加回时间轮 
      {
        int ret = AddTimeout(ctx->pTimeout, lp, now);
        if (!ret) 
        {
          lp->bTimeout = false;
          lp = active->head;
          continue;
        }
      }
      if( lp->pfnProcess )  //调用stTimeoutItem_t项的执行函数
      {
        lp->pfnProcess( lp );
      }

      lp = active->head;
    }
    if( pfn )  //用于用户控制跳出事件循环
    {
      if( -1 == pfn( arg ) )
      {
        break;
      }
    }
  }
}
```
# hook后的`poll`

```cpp
struct pollfd {
  int   fd;         /* file descriptor */
  short events;     /* requested events */
  short revents;    /* returned events */
};
int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

原始的`poll`函数以`pollfd`数组的形式传入fd以及关注的事件`events`，并返回相应的时间于`revents`。此外`poll`支持毫秒级别的超时设置，当`timeout`设置为非0值时(负数为永久)，线程会阻塞于poll直到有对应事件发生或超时。

libco所hook后的poll可以在IO协程阻塞时让出上下文，切换至主协程。其中，大部分代码是处理传入`pollfd`数组中相同fd的事件合并和还原。代码中的核心部分为`co_poll_inner`，其代码如下，


```cpp
/* poll内核
 * @param 
 * ctx:epoll句柄
 * fds:fd数组
 * nfds:fd数组长度
 * timeout:超时时间ms
 * pollfunc:默认poll 
 */
int co_poll_inner( stCoEpoll_t *ctx,struct pollfd fds[], nfds_t nfds, int timeout, poll_pfn_t pollfunc)
{
  if (timeout == 0) //poll: Specifying a timeout of zero causes poll() to return immediately, even if no file descriptors are ready.
  {
    return pollfunc(fds, nfds, timeout);  //调用系统原生poll(其实上层poll已经做过检查了，此处无需再做)
  }
  if (timeout < 0)  //poll: Specifying a negative value in timeout means an infinite timeout.
  {
    timeout = INT_MAX;
  }
  int epfd = ctx->iEpollFd;
  stCoRoutine_t* self = co_self();

  //1.struct change
  stPoll_t& arg = *((stPoll_t*)malloc(sizeof(stPoll_t))); //分配一个stPoll_t
  memset( &arg,0,sizeof(arg) );

  arg.iEpollFd = epfd;  //此处stPoll_t与stCoEpoll_t进行关联
  arg.fds = (pollfd*)calloc(nfds, sizeof(pollfd));  //分配nfds个pollfd
  arg.nfds = nfds;

  stPollItem_t arr[2];
  if( nfds < sizeof(arr) / sizeof(arr[0]) && !self->cIsShareStack)  //nfds少于2且未使用共享栈的情况下
  {
    arg.pPollItems = arr;
  } 
  else
  {
    arg.pPollItems = (stPollItem_t*)malloc( nfds * sizeof( stPollItem_t ) );
  }
  memset( arg.pPollItems,0,nfds * sizeof(stPollItem_t) );

  arg.pfnProcess = OnPollProcessEvent;  //处理函数, 调用co_resume(arg.pArg), 唤醒参数arg.pArg所指协程
  arg.pArg = GetCurrCo( co_get_curr_thread_env() ); //处理函数参数, 即当前协程
  
  
  //2. add epoll
  for(nfds_t i=0;i<nfds;i++)
  {
    arg.pPollItems[i].pSelf = arg.fds + i;  //关联stPollItem_t与pollfd
    arg.pPollItems[i].pPoll = &arg; //指向所属stPoll_t

    arg.pPollItems[i].pfnPrepare = OnPollPreparePfn;  //设置预处理
    struct epoll_event &ev = arg.pPollItems[i].stEvent;

    if( fds[i].fd > -1 )  //fd有效
    {
      ev.data.ptr = arg.pPollItems + i; //设置stPollItem_t.stEvent.data.ptr指向stPollItem_t
      ev.events = PollEvent2Epoll( fds[i].events ); //设置stPollItem_t.stEvent.data.events

      int ret = co_epoll_ctl( epfd,EPOLL_CTL_ADD, fds[i].fd, &ev ); //将stPollItem_t.stEvent加入stCoEpoll_t.iEpollFd中
      if (ret < 0 && errno == EPERM && nfds == 1 && pollfunc != NULL) //nfds只有一个时，插入epoll失败, 释放掉临时的stPoll_t
      {
        if( arg.pPollItems != arr )
        {
          free( arg.pPollItems );
          arg.pPollItems = NULL;
        }
        free(arg.fds);
        free(&arg);
        return pollfunc(fds, nfds, timeout);  //执行原生poll
      }
    }
    //if fail,the timeout would work
  }

  //3.add timeout

  unsigned long long now = GetTickMS();
  arg.ullExpireTime = now + timeout;
  int ret = AddTimeout( ctx->pTimeout,&arg,now ); //将stPoll_t加入stCoEpoll_t的时间轮
  int iRaiseCnt = 0;
  if( ret != 0 )
  {
    co_log_err("CO_ERR: AddTimeout ret %d now %lld timeout %d arg.ullExpireTime %lld",
        ret,now,timeout,arg.ullExpireTime);
    errno = EINVAL;
    iRaiseCnt = -1;

  }
    else
  {
    co_yield_env( co_get_curr_thread_env() ); //让出CPU, 等待epoll中的事件发生或超时
    iRaiseCnt = arg.iRaiseCnt;  //再次回来, 回来前会执行OnPollPreparePfn, 已经将stPoll_t设置好iRaiseCnt, revents, 并从时间轮中删除 
  }

    {
    //clear epoll status and memory
    RemoveFromLink<stTimeoutItem_t,stTimeoutItemLink_t>( &arg );  //从时间轮中删除
    for(nfds_t i = 0;i < nfds;i++)
    {
      int fd = fds[i].fd;
      if( fd > -1 )
      {
        co_epoll_ctl( epfd,EPOLL_CTL_DEL,fd,&arg.pPollItems[i].stEvent ); //从epoll中删除
      }
      fds[i].revents = arg.fds[i].revents;  //返回已经触发的事件
    }


    if( arg.pPollItems != arr ) //释放stPoll_t
    {
      free( arg.pPollItems );
      arg.pPollItems = NULL;
    }

    free(arg.fds);
    free(&arg);
  }

  return iRaiseCnt;
}
```

如下图所示，代码中前半部分$L1-L90$将fd封装为`stPoll_t`，并将其加入到时间轮超时管理器中。

$L91$让出CPU，切出当前循环。

$L92$之后是在事件循环触发后，调用与`L41`中的`OnPollProcessEvent`切换至对应协程后，进行对应的清理工作。

```cpp
void OnPollProcessEvent( stTimeoutItem_t * ap )
{
  stCoRoutine_t *co = (stCoRoutine_t*)ap->pArg;
  co_resume( co );
}
```

{{< figure src="/image/libco-auto/stCoEpoll_t.png" width="90%" caption="图2. poll相关结构">}}


# 最后

至此，我们介绍libco源码中自动切换的部分代码。感谢你的阅读。如果你有任何疑虑和感想，或发现本文有任何错误，请一定[让我知道](mailto:changliu0828@gmail.com)。


# 参考

1. [libco源码分析，csdn](https://blog.csdn.net/weixin_43705457/article/details/106863859)
2. [libco分享，李方源](http://purecpp.org/purecpp/static/64a819e99584452aab70a7f9c307717f.pdf)

