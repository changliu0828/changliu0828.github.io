---
title: "分布式事务与两阶段提交"
date: 2020-10-21T14:34:06+08:00
toc: true
comments: true
draft: true
categories:
  - Summary
tags:
  - Distributed System 
  - Distributed Transaction
  - Two Phase Commit
  - Three Phase Commit
---

<!--more-->

# 1. 分布式事务

# 1.1. 并发控制

concurrency control

# 1.2. 原子性提交

atomic commitment

+ AC1. 所有节点达成相同的决策。
+ AC2. 在达成决策后，节点不能反悔。
+ AC3. 仅当所有的节点投票 `YES` 时，事务才可以达成提交(Commit)决策。 
+ AC4. 如果没有节点失效，并所有节点都投票为 `YES`，则事务能成功提交(Commit)。
+ AC5. 如果仅考虑算法可以容忍的异常。在执行过程中，如果所有现有的异常都被修复，且在一段时间内没有新的异常，那么所有的节点能够成功达成决策。

# 2. 两阶段提交

## 2.1. 正常流程

在不考虑消息超时以及节点故障的情况下，两阶段提交的流程如下，

1. 协调者发送 `VOTE-REQ` 给所有参与者。
2. 当参与者收到 `VOTE-REQ` 时，根据本地运算结果 `YES` 或 `NO` ，回复给协调者 `VOTE-RES`。如果回复 `NO`，本地即可对此事务执行 `ABORT`。
3. 协调者收集所有参与者回复的投票信息 `VOTE-RES`。如果所有参与者投票 `YES`，协调者提交事务，发送消息 `COMMIT` 给所有参与者。否则，终止事务并发送消息 `ABORT` 给所有投票为 `YES` 的参与者。
4. 任意投票为 `YES` 的参与者等待来自协调者的 `COMMIT` 或 `ABORT` 消息，当收到对应消息时，执行对应操作。

下面两图分别展示了正常流程下，事务成功执行与终止的情况，

{{< figure src="/image/2pc/2pc_succ.png" width="100%" caption="图. 事务成功">}}

{{< figure src="/image/2pc/2pc_abort.png" width="100%" caption="图. 事务终止">}}

## 2.2. 超时处理

在正常流程中，第2/3/4步涉及节点等待消息的情况。

第2步中，参与者等待来自协调者的 `VOTE-REQ`。此时发生超时，由于系统并没有对事务达成共识，参与者可以单方面终止事务。

{{< figure src="/image/2pc/timeout2.png" width="100%" caption="图. 第2步超时">}}

第3步中，协调者等待来自参与者的 `VOTE-RES`。此时发生超时，由于系统并没有对事务达成共识，协调者也可以单方面终止事务。

{{< figure src="/image/2pc/timeout3.png" width="100%" caption="图. 第3步超时">}}

第4步中，投票为 `YES` 的参与者 `p` 等待 `COMMIT` 或 `ABORT` 消息。与之前的两种情况不同，此时 `p` 处于不确定的状态，它必须通过某种机制咨询其他节点来获取决策，我们称其为**Termination Protocol**。

### 2.2.1. Termination Protocol

最简单的**Termination Protocol**为：`p` 阻塞直至恢复与协调者之间的通信，主动询问或由协调者告知决策结果。

不难发现这种方式虽然满足AC5，但 `p` 的阻塞时间可能很长。那么有没有办法减少这种阻塞呢？考虑这种情况，在有两个参与者 `p` 和 `q` 的事务中，协调者在发送 `COMMIT` 或 `ABORT` 给 `q` 之后，且尚未发送给 `p` 之前出现节点失效。此时，由于事务已经达成一致决策，且 `q` 已经知道决策结果。`p` 完全可以通过向 `q` 咨询来避免阻塞。这种策略被称为 **Cooperative Termination Protocol**。

### 2.2.2. Cooperative Termination Protocol

**Cooperative Termination Protocol** 的过程为：当某参与者 `p` 在第4步等待超时，他发送一个 `DECISION-REQ` 给所有其他节点 `q` 询问是否已经知晓决策结果，或已单方面决策。在此场景下，`p` 被称为 *initiator*，`q` 被称为 *responder*。考虑下面三种情况，

1. `q` 已经收到决策`COMMIT`（或`ABORT`），`q` 只需将决策发回给 `p`，由 `p` 进行对应操作。
2. `q` 尚未投票，`q` 可以单方面 `ABORT`，终止整个事务，并告知 `p`。
3. `q` 已经投了 `YES` 票，但尚未知晓决策结果。此时 `q` 与 `p` 一样处于不确定状态，无能为力。下图描述了这一情况。

{{< figure src="/image/2pc/timeout4.png" width="100%" caption="图. Cooperative Termination Protocol 无效情况">}}

在上述的1，2两种情况下，`p` 都可以无需阻塞达成决策。另一方面，如果所有的节点 `q` 都处于情况3，则 `p` 依然会被阻塞直至满足1，2中的任一情况。

综上 **Cooperative Termination Protocol** 降低了节点的阻塞概率，但并没有从根本上解决问题。

## 2.3. 故障恢复

# 3. 三阶段提交

# 4. 参考

1. [P. A., Hadzilacos, V., & Goodman, N., Concurrency Control And Recovery in Database Systems, Bernstein, 1987](http://www.sigmod.org/publications/dblp/db/books/dbtext/bernstein87.html)
2. [Robert Morris. 6.824 Distributed Systems. Spring 2020. Massachusetts Institute of Technology: MIT OpenCourseWare](https://pdos.csail.mit.edu/6.824/index.html)


