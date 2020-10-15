---
title: "Spanner: Google's Globally Distributed Database, Google, 2012"
date: 2020-10-12
draft: true
comments: true
categories:
  - 论文笔记 
tags:
  - Distributed System 
  - True Time 
---

[Spanner: Google’s Globally-Distributed Database](https://pdos.csail.mit.edu/6.824/papers/spanner.pdf)

# 特性

**external consistency:** 

> if a transaction $T_1$ commits before another transaction $T_2$ starts, then $T_1$'s commit timestamp is smaller than $T_2$'s.

如果事务 $T_1$ 的提交先于事务 $T_2$ 的开始，那么 $T_1$ 的提交时间戳应该小于 $T2$ 的提交时间戳。$T_2$ 可以读到所有 $T_1$ 产生的写操作。

# 架构

{{< figure src="/image/Spanner-Googles-Globally-Distributed-Database/Figure1.jpg" width="70%" caption="图1.">}}

+ **Universe**：一个完整的Spanner部署，目前只有test/playground，development/production，production-only三个Universe。
  + **universemaster**：提供console做universe内的各个Zone监控，debug等。
  + **placement driver**：定时的检查数据，按需进行数据迁移，满足副本的限制或保证负载均衡。
  + **Zone**：对应用户的一个应用级别部署。
    + **zonemaster**：每个zone只有一个，分配数据。
    + **location proxy**：用于定位data所在spanserver
    + **span server**：数据所在服务器。

{{< figure src="/image/Spanner-Googles-Globally-Distributed-Database/Figure2.jpg" width="70%" caption="图2.">}}

{{< figure src="/image/Spanner-Googles-Globally-Distributed-Database/hierarchy.png" width="80%" caption="图3.">}}

# 读写事务

# 只读事务



