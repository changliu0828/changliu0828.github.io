---
title: "Time, Clocks, and the Ordering of Events in a Distributed System, Lamport, 1978"
date: 2020-10-06T10:02:07+08:00
categories:
  - 论文笔记 
tags:
  - Distributed System 
  - Clock
  - State Machine
---

本篇文章总结学习了Lamport于1978年发表在 *Communications of the ACM* 上的论文 [Time, Clocks, and the Ordering of Events in a Distributed System](https://lamport.azurewebsites.net/pubs/time-clocks.pdf)，文章获得了2000年 *PODC Influential Paper Award*，2007年 *SIGOPS Hall of Fame Award*。在这篇文章中，Lamport提出了“Happen Before”，“逻辑时钟”，“物理时钟”，“State Machine”等重要概念与算法，是分布式领域不能不读的经典论文。

<!--more-->

# 1. 时间是什么

时间的定义对于分布式领域关于“某件事先发生”，“并发”等概念的认识至关重要。Lamport认为时间是由更加基本的概念“事件发生的顺序”衍生出来的。例如我们说某件事在3:15发生，其实是在说这件事发生在我们读到时钟上的读数为3:15之后，3:16之前。时钟其实是对连续的时间进行了离散化。

# 2. 分布式系统

本文中，分布式系统指的是若干空间上分离的process，同一process上的事件顺序串行发生，他们之间通过收发消息进行通信。这里的process可以是若干独立的计算机，独立的进程，亦或是一台计算机内独立的硬件模块。在后文中我们我们统称process为“节点”。

# 3. Happened Before 偏序关系

对于一个分布式系统中的若干事件，我们定义“happened before”关系，用"$\rightarrow$"标识。其满足如下三个条件，

+ (1) 如果 $a$ 和 $b$ 是在相同节点上的两个事件，$a$ 在 $b$ 之前发生，则有 $a \rightarrow b$ 。
+ (2) 如果事件 $a$ 表示某个节点发送某条消息，$b$ 是另一个节点接受这条消息，则有 $a \rightarrow b$ 。
+ (3) 如果有 $a \rightarrow b, b \rightarrow c$ ，则有 $a \rightarrow c$ 。

当且仅当 $a \nrightarrow b, b \nrightarrow a$ 时，我们称两个事件为**并发的(concurrent)**。

此外，我们规定 $\rightarrow$ 为非自反关系，即 $a \nrightarrow a$ 。显然，说一件事发生在自己“之前”并无任何意义。

为了直观的描述这一关系，Lamport引入了如下图所示的“时空图”，图中垂直方向自下而上为时间发生顺序，水平方向为空间上的不同节点。图中的黑色圆点表示事件，波浪线箭头表示通信消息。我们可以找到图中的若干对“happened before”关系，例如 $p_1 \rightarrow r_4$，其由 $ p_1 \rightarrow q_2 \rightarrow q_4 \rightarrow r_3 \rightarrow r_4$ 推导而来。

图中亦有若干并发的事件，例如 $p_3$ 和 $q_3$，虽然在图中我们能看到 $p_3$ 发生的物理时间(physical time)晚于 $q_3$，但对于 $p,q$ 两节点来说他们并不知道谁先谁后。

{{< figure src="/image/Time-Clocks-and-the-Ordering-of-Events-in-a-Distributed-System/Fig1.jpg" width="70%" caption="图1. space-time diagram">}}

# 4. 逻辑时钟

> a clock is just a way of assigning a number to an event.

**时钟仅仅是对事件的发生予以编号而已。** 更加准确地讲，对于每一个节点 $P_i$ 我们定义时钟 $C_i$ 为一个函数，它为任意的事件 $a$ 赋值编号为 $C_i \langle a \rangle$。在整个系统时钟来讲，任意事件 $b$ 的发生时间标记为 $  C \langle b \rangle $，如果其发生在节点 $P_j$ 上，则$ C \langle b \rangle =  C_j \langle b \rangle$。这里的时钟我们看做是系统内部的逻辑时钟，而非物理时钟，其标识与计数方法无需与物理时间一致。由上文的偏序关系，我们可以推导得出下面的Clock Condition.

**Clock Condition.** 对于系统中的任意事件 $a, b$：如果$ a \rightarrow b$ 则 $C \langle a \rangle < C \langle b \rangle$。

+ C1. 如果 $a$ 和 $b$ 是在相同节点 $P_i$ 上的两个事件，$a$ 在 $b$ 之前发生，则有 $C_i \langle a \rangle < C_i \langle b \rangle$。
+ C2. 如果事件 $a$ 表示节点 $P_i$ 发送某条消息，$b$ 表示节点 $P_j$ 接受这条消息，则有$ C_i \langle a \rangle < C_j \langle b \rangle $。

对于逻辑时钟，我们可以想象单个节点内不断发生着“tick”事件，例如在同一节点 $P_i$ 内连续发生的 $a, b$ 两个事件，有 $C_i \langle a \rangle = 4, C_i \langle b \rangle = 7$，那么在这两个事件之间发生了编号为 $5,6,7$ 的 tick 事件。于是我们可以在时空图中加入类似下图的"tick line"（图中虚线）。根据 **Clock Condition.** 中的 C1 我们可以得到，在同一节点内的连续两个事件之间，必须至少有一条 tick line。 根据 C2 我们可以得到，每一条消息必须穿过至少一条 tick line。

{{< figure src="/image/Time-Clocks-and-the-Ordering-of-Events-in-a-Distributed-System/Fig2.png" width="70%" caption="图2">}}

我们也可以在保证事件和消息的偏序关系下，将 tick line 绘制成如下图中的水平线，这样会对理解更有帮助，

{{< figure src="/image/Time-Clocks-and-the-Ordering-of-Events-in-a-Distributed-System/Fig3.png" width="70%" caption="图3">}}

对于单个节点上的函数`C`的实现，我们有如下的实现规则（Implementation rule）：

+ IR1. 每个节点 $P_i$ 在任意连续的两个事件之间都要增加 $C_i$ 。
+ IR2. (a) 如果事件 $a$ 表示节点 $P_i$ 发送消息 $m$ ，那么 $m$ 中包含时间戳 $T_m=C_i \langle a \rangle $。(b) 当收到消息 $m$ 时，进程 $P_j$ 设置当前时间 $C_j$ 为 $ C_j'$，使得 $C_j' >= C_j$ 且 $C_j' > Tm$ 。

在实际我们收到某条消息后，应当先执行 IR2 修改时间，再执行具体事件。

# 5. 全序关系

利用逻辑时钟，我们对整个系统中的事件进行全序(total order)排序。我们首先根据事件发生的时间对其排序。对于发生时间相同的事件，我们引入对于所有节点的预定顺序 $\prec$，这里的顺序可以是根据 id 排序等任意规则。

更加严谨的说，我们定义全序关系 $\Rightarrow$。对于发生在节点 $P_i$ 的事件 $a$ 和发生在节点 $P_j$ 的事件 $b$，有 $ a \Rightarrow b $ 当且仅当 (i) $ C_i \langle a \rangle < C_j \langle b \rangle $ 或 (ii) $C_i \langle a \rangle = C_j \langle b \rangle$且$P_i \prec P_j$。

这里由 **Clock Condition.** 我们可以看到，凡是满足偏序关系$\rightarrow$的，一定也满足全序关系$\Rightarrow$。

## 全序关系的应用：互斥访问

TODO

# 6. 物理时钟

**Strong Clock Condition.** 对于 $\varphi$ 中的任意事件 $a, b$：如果$ a \rightarrow b$ 则 $C \langle a \rangle < C \langle b \rangle$。

 + PC1. 存在一个常数 $\kappa \ll 1$，对于所有的 $i$ 有 $| dC_i(t)/dt - 1 | < \kappa$。对于典型的晶控时钟(crystal controlled clock)，$\kappa \leq 10^{-6}$。
 + PC2. 对于所有的 $i, j$：$|C_i(t) - C_j(t)| < \varepsilon$。
