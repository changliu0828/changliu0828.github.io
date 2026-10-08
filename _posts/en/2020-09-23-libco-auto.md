---
title: "libco Source Notes (3): Automatic Switching"
layout: post
ref: libco-auto
---
# libco Source Notes (3): Automatic Switching

In the previous post, libco Source Notes (2): Explicit Switching, we covered the explicit coroutine switching interfaces that libco provides, and discussed how to use a coroutine pool. This post covers the interfaces libco provides for automatic switching. I suggest reading it together with my [annotated version](https://github.com/changliu0828/libco).


## Background of Automatic Switching

In Li Fangyuan's libco talk$^{[2]}$, he explains that before libco, most network communication in WeChat used synchronous IO interfaces. To quickly adapt the existing business code, libco hooks system calls and provides coroutine-based primitives such as `poll`, `read` and `write`. Because of how coroutines work, a system call that used to block now behaves as if it were non-blocking.

## Timeout Management

libco needs to manage events that require timeouts, such as network IO and condition variables, in one place. For this, it implements a timeout manager based on a timing wheel. Before I cover how libco hooks system calls, let's lay some groundwork on how this timeout manager is implemented.

As Figure 1 shows, the timing wheel is the dark red wheel-shaped array in the figure. we call each cell of the array a slot. A single slot stores the list of events registered within a certain period of time (the yellow linked lists in the figure). In libco, one slot has a precision of 1 millisecond. The whole wheel has 60000 slots, so it covers 60 seconds. The timing wheel has two main interface functions in libco, shown below.

`AddTimeout` computes the difference between the current time `allNow` and the wheel start time `ullStart`, and inserts the item into the matching slot. Note that when the timeout is longer than the wheel length of 60 seconds, libco inserts the event into the "last" slot.

`TakeAllTimeout` computes the difference between the current time `allNow` and the wheel start time `ullStart` to find the matching slot. It then walks all slots from the slot at the start index `ullStartIdx` up to that slot, and moves the timed-out items into the result list `apResult`.

With this, we can see that libco uses the timing wheel to manage timeout events efficiently.


```cpp
/* Insert a new item into the timing wheel
 * @param 
 * apTimeout :timing wheel structure
 * apItem    :new timeout item
 * allNow    :current time (timestamp in ms)
 * @return   :0 on success, else the failure line number
 */
int AddTimeout( stTimeout_t *apTimeout,stTimeoutItem_t *apItem ,unsigned long long allNow );
/* Take all timeout items out of the timing wheel
 * @param 
 * apTimeout:timing wheel structure
 * allNow   :current time (timestamp in ms)
 * apResult :result list of timeout events
 */
inline void TakeAllTimeout( stTimeout_t *apTimeout,unsigned long long allNow,stTimeoutItemLink_t *apResult );
```

![Figure 1. Timeout management](/assets/images/libco-auto/timing-wheel.png){: width="100%" }
*Figure 1. Timeout management*

## Event Loop

libco manages IO events with epoll. `co_eventloop` triggers the IO events and switches to the matching coroutine to run it. Recall the thread-private global variable `stCoRoutineEnv_t` mentioned earlier, which represents the coroutine runtime environment. It holds the epoll structure handle `pEpoll`:

```cpp
struct stCoRoutineEnv_t
{
  stCoRoutine_t *pCallStack[ 128 ];   //call stack of all coroutines
  int iCallStackSize;                 //index of the top of pCallStack
  stCoEpoll_t *pEpoll;                //epoll wrapper

  //for copy stack log lastco and nextco
  stCoRoutine_t* pending_co;           
  stCoRoutine_t* occupy_co;           //current coroutine
};
```
`stCoEpoll_t` is defined as follows:

```cpp
struct stCoEpoll_t
{
  int iEpollFd;                                   //EpollFd
  static const int _EPOLL_SIZE = 1024 * 10;       //max number of events returned by one epoll_wait call
  struct stTimeout_t *pTimeout;                   //timing wheel, timeout management
  struct stTimeoutItemLink_t *pstTimeoutList;     //list of timed-out items
  struct stTimeoutItemLink_t *pstActiveList;      //list of ready items  
  co_epoll_res *result;                           //epoll_wait result
};
```

The main event loop code is as follows,

$L11$ blocks on `epoll_wait` with a timeout of 1 millisecond. This `epoll_wait` is not hooked. It is the native system call.

$L13-L29$ takes out all events in `result->events`, runs the prepare function `pfnPrepare`, and adds them to the `active` list.

$L32-L42$ takes out all timeout events and adds them to the `active` list.

$L59$ calls the process function `pfnProcess` for every event in the `active` list.

$L66$ checks whether the event loop needs to exit:

```cpp
/* Event loop
 * @param 
 * ctx:epoll handle
 * pfn:function that checks whether to exit the event loop
 * arg:argument of pfn
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

    memset( timeout,0,sizeof(stTimeoutItemLink_t) );  //clear the timeout queue

    for(int i=0;i<ret;i++)  //walk the fds that have events
    {
      stTimeoutItem_t *item = (stTimeoutItem_t*)result->events[i].data.ptr; //get the stTimeoutItem_t that the event data points to
      if( item->pfnPrepare )  //if there is a prepare function, run it; it adds the item to the ready list
      {
        item->pfnPrepare( item,result->events[i],active );
      }
      else  //add to the ready list manually
      {
        AddTail( active,item );
      }
    }

    unsigned long long now = GetTickMS();
    TakeAllTimeout( ctx->pTimeout,now,timeout );  //insert the timed-out items into the timeout list

    stTimeoutItem_t *lp = timeout->head;
    while( lp )
    {
      //printf("raise timeout %p\n",lp);
      lp->bTimeout = true;  //mark as timed out
      lp = lp->pNext;
    }

    Join<stTimeoutItem_t,stTimeoutItemLink_t>( active,timeout );  //merge the timeout list into the ready list

    lp = active->head;
    while( lp )
    {

      PopHead<stTimeoutItem_t,stTimeoutItemLink_t>( active );
            if (lp->bTimeout && now < lp->ullExpireTime)  //marked as timed out but the expire time is not reached yet, add it back to the timing wheel 
      {
        int ret = AddTimeout(ctx->pTimeout, lp, now);
        if (!ret) 
        {
          lp->bTimeout = false;
          lp = active->head;
          continue;
        }
      }
      if( lp->pfnProcess )  //call the process function of the stTimeoutItem_t item
      {
        lp->pfnProcess( lp );
      }

      lp = active->head;
    }
    if( pfn )  //lets the user break out of the event loop
    {
      if( -1 == pfn( arg ) )
      {
        break;
      }
    }
  }
}
```

## The Hooked `poll`

```cpp
struct pollfd {
  int   fd;         /* file descriptor */
  short events;     /* requested events */
  short revents;    /* returned events */
};
int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

The original `poll` function takes the fds and the events of interest `events` as an array of `pollfd`. It returns the events that happened in `revents`. `poll` also supports a timeout in milliseconds. When `timeout` is set to a non-zero value (a negative value means forever), the thread blocks in poll until a matching event happens or the timeout expires.

The hooked poll in libco can give up the context when an IO coroutine blocks, and switch to the main coroutine. Most of its code merges and restores the events of identical fds in the `pollfd` array passed in. The core part of the code is `co_poll_inner`, shown below:


```cpp
/* poll core
 * @param 
 * ctx:epoll handle
 * fds:fd array
 * nfds:length of the fd array
 * timeout:timeout in ms
 * pollfunc:default poll 
 */
int co_poll_inner( stCoEpoll_t *ctx,struct pollfd fds[], nfds_t nfds, int timeout, poll_pfn_t pollfunc)
{
  if (timeout == 0) //poll: Specifying a timeout of zero causes poll() to return immediately, even if no file descriptors are ready.
  {
    return pollfunc(fds, nfds, timeout);  //call the native system poll (the upper-level poll has already checked this, so it is not needed here)
  }
  if (timeout < 0)  //poll: Specifying a negative value in timeout means an infinite timeout.
  {
    timeout = INT_MAX;
  }
  int epfd = ctx->iEpollFd;
  stCoRoutine_t* self = co_self();

  //1.struct change
  stPoll_t& arg = *((stPoll_t*)malloc(sizeof(stPoll_t))); //allocate a stPoll_t
  memset( &arg,0,sizeof(arg) );

  arg.iEpollFd = epfd;  //link stPoll_t with stCoEpoll_t here
  arg.fds = (pollfd*)calloc(nfds, sizeof(pollfd));  //allocate nfds pollfd
  arg.nfds = nfds;

  stPollItem_t arr[2];
  if( nfds < sizeof(arr) / sizeof(arr[0]) && !self->cIsShareStack)  //when nfds is less than 2 and the shared stack is not used
  {
    arg.pPollItems = arr;
  } 
  else
  {
    arg.pPollItems = (stPollItem_t*)malloc( nfds * sizeof( stPollItem_t ) );
  }
  memset( arg.pPollItems,0,nfds * sizeof(stPollItem_t) );

  arg.pfnProcess = OnPollProcessEvent;  //process function, calls co_resume(arg.pArg) to wake up the coroutine that arg.pArg points to
  arg.pArg = GetCurrCo( co_get_curr_thread_env() ); //argument of the process function, i.e. the current coroutine
  
  
  //2. add epoll
  for(nfds_t i=0;i<nfds;i++)
  {
    arg.pPollItems[i].pSelf = arg.fds + i;  //link stPollItem_t with pollfd
    arg.pPollItems[i].pPoll = &arg; //point to the stPoll_t it belongs to

    arg.pPollItems[i].pfnPrepare = OnPollPreparePfn;  //set the prepare function
    struct epoll_event &ev = arg.pPollItems[i].stEvent;

    if( fds[i].fd > -1 )  //fd is valid
    {
      ev.data.ptr = arg.pPollItems + i; //make stPollItem_t.stEvent.data.ptr point to stPollItem_t
      ev.events = PollEvent2Epoll( fds[i].events ); //set stPollItem_t.stEvent.data.events

      int ret = co_epoll_ctl( epfd,EPOLL_CTL_ADD, fds[i].fd, &ev ); //add stPollItem_t.stEvent to stCoEpoll_t.iEpollFd
      if (ret < 0 && errno == EPERM && nfds == 1 && pollfunc != NULL) //when nfds is 1 and adding to epoll fails, free the temporary stPoll_t
      {
        if( arg.pPollItems != arr )
        {
          free( arg.pPollItems );
          arg.pPollItems = NULL;
        }
        free(arg.fds);
        free(&arg);
        return pollfunc(fds, nfds, timeout);  //run the native poll
      }
    }
    //if fail,the timeout would work
  }

  //3.add timeout

  unsigned long long now = GetTickMS();
  arg.ullExpireTime = now + timeout;
  int ret = AddTimeout( ctx->pTimeout,&arg,now ); //add stPoll_t to the timing wheel of stCoEpoll_t
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
    co_yield_env( co_get_curr_thread_env() ); //give up the CPU and wait for an event in epoll or a timeout
    iRaiseCnt = arg.iRaiseCnt;  //we are back; before coming back, OnPollPreparePfn has already set iRaiseCnt and revents on stPoll_t, and removed it from the timing wheel 
  }

    {
    //clear epoll status and memory
    RemoveFromLink<stTimeoutItem_t,stTimeoutItemLink_t>( &arg );  //remove from the timing wheel
    for(nfds_t i = 0;i < nfds;i++)
    {
      int fd = fds[i].fd;
      if( fd > -1 )
      {
        co_epoll_ctl( epfd,EPOLL_CTL_DEL,fd,&arg.pPollItems[i].stEvent ); //remove from epoll
      }
      fds[i].revents = arg.fds[i].revents;  //return the events that have fired
    }


    if( arg.pPollItems != arr ) //free stPoll_t
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

As the figure below shows, the first half of the code, $L1-L90$, wraps the fds in `stPoll_t` and adds it to the timing wheel timeout manager.

$L91$ gives up the CPU and switches out of the current coroutine.

After $L92$, once the event loop fires, it calls the `OnPollProcessEvent` set at `L41` to switch to the matching coroutine, and then does the cleanup:

```cpp
void OnPollProcessEvent( stTimeoutItem_t * ap )
{
  stCoRoutine_t *co = (stCoRoutine_t*)ap->pArg;
  co_resume( co );
}
```

![Figure 2. Structures related to poll](/assets/images/libco-auto/stCoEpoll_t.png){: width="90%" }
*Figure 2. Structures related to poll*


## Conclusion

This post covered the parts of the libco source code that handle automatic switching. Thank you for reading. If you have any questions or thoughts, or find any mistake in this post, please [let me know](mailto:changliu0828@gmail.com).


## References

1. [libco source code analysis, csdn (in Chinese)](https://blog.csdn.net/weixin_43705457/article/details/106863859)
2. [libco talk, Li Fangyuan (in Chinese)](http://purecpp.org/purecpp/static/64a819e99584452aab70a7f9c307717f.pdf)

