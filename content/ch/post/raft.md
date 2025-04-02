---
title: "MIT6.824课程笔记: Lab2 Raft"
date: 2021-02-02T10:50:36+08:00
draft: true
toc: true
---

<!--more-->

# Part 2A

> Implement Raft leader election and heartbeats (AppendEntries RPCs with no log entries). The goal for Part 2A is for a single leader to be elected, for the leader to remain the leader if there are no failures, and for a new leader to take over if the old leader fails or if packets to/from the old leader are lost.

在Part 2A中，我们需要实现初步的选举算法。

## Main Loop

```go
func (rf *Raft) loop() {
    for {
        if rf.killed() {
            return
        }
        switch atomic.LoadInt32(&rf.state) {
        case FOLLOWER:
            if NowUnixMS() > atomic.LoadInt64(&rf.electionTimeout) { //超时触发选举
                rf.SendRequestVote()                                         
            }
            time.Sleep(10 * time.Millisecond)
        case CANDIDATE:
            time.Sleep(10 * time.Millisecond)
        case LEADER:
            rf.SendAppendEntries() //心跳
            time.Sleep(time.Duration(HEARTBEAT_PERIOD_MS) * time.Millisecond)
        }
    }
}
```

## RequestVote RPC
```go
type RequestVoteArgs struct {
    Term         int //候选人当前Term
    CanditateId  int //候选人ID
    LastLogIndex int //候选人最新LogEntry的Index
    LastLogTerm  int //候选人最新LogEntry的Term
}
type RequestVoteReply struct {
    Term        int  //当前Term，用于候选人更新自身Term
    VoteGranted bool //是否投票
}
```

## SendRequestVote
```go
func (rf *Raft) RequestVote(args *RequestVoteArgs, reply *RequestVoteReply) {
	rf.mu.Lock()
	defer rf.mu.Unlock()
	if args.Term < rf.currentTerm {
		reply.VoteGranted = false
	} else {
		if args.Term > rf.currentTerm {
			rf.state = FOLLOWER
			rf.currentTerm = args.Term
			rf.votedFor = -1
		}
		rf.electionTimeout = RandElectionTimeout()
		reply.VoteGranted = (rf.votedFor == -1 || rf.votedFor == args.CanditateId) && UpToDate(args.LastLogTerm, args.LastLogIndex, rf.getLastLogTerm(), rf.getLastLogIndex())
		if reply.VoteGranted {
			rf.votedFor = args.CanditateId
		}
		rf.persist()
	}
	reply.Term = rf.currentTerm
}
func (rf *Raft) SendRequestVote() {
    rf.mu.Lock()
    rf.currentTerm++ //Term自增
    rf.state = CANDIDATE //设置身份为候选人
    rf.votedFor = rf.me //投给自己
    rf.electionTimeout = RandElectionTimeout() //随机选举超时时间, 超过后发起下一轮选举
    rf.mu.Unlock()
    args := RequestVoteArgs{Term: rf.currentTerm, CanditateId: rf.me, LastLogIndex: 0, LastLogTerm: 0}
    var mu sync.Mutex
    cond := sync.NewCond(&mu)   //条件变量
    grantedCnt := 0 //已获得投票数
    finishedCnt := 1 //已投给自己
    for server, _ := range rf.peers {
        if server == rf.me {
            continue
        }
        go func(server int) {
            reply := RequestVoteReply{}
            rf.peers[server].Call("Raft.RequestVote", &args, &reply)
            mu.Lock()
            defer mu.Unlock()
            finishedCnt++
            if reply.VoteGranted {
                grantedCnt++
            }
            cond.Broadcast()
        }(server)
    }
    mu.Lock()
    defer mu.Unlock()
    for grantedCnt < int(math.Ceil(float64(len(rf.peers)/2))) && finishedCnt < len(rf.peers) {
        cond.Wait()
    }
    if grantedCnt >= int(math.Ceil(float64(len(rf.peers)/2))) {
        rf.mu.Lock()
        rf.state = LEADER
        rf.mu.Unlock()
        rf.SendAppendEntries()
    } else {
        rf.mu.Lock()
        rf.state = FOLLOWER
        rf.mu.Unlock()
    }
}
```

# Part 2B

# Part 2C

