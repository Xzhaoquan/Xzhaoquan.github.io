---
title: Linux应用编程-IPC信号量
categories: Linux
date: 2022-10-28 20:30:16
tags: Linux应用开发
---

## Linux应用编程-信号量

#### 信号量的工作原理

##### 信号量的PV操作

信号量只能进行两种操作：等待和发送信号，即 P 操作和 V 操作，锁行为就是 P 操作，解锁就是 V 操作，可以直接理解为 P 操作是申请资源， V 操作是释放资源。   

ipcs -l  查看ipc信息

信号量的P操作：

```
P 操作：如果有可用的资源（信号量值大于 0），则占用一个资源（给信号量值减去一，进
入临界区代码） ; 如果没有可用的资源（信号量值等于 0），则阻塞，直到系统将资源分配
给该进程（进入等待队列，一直等到资源轮到该进程）。
```

信号量的V操作：

```
V 操作：如果在该信号量的等待队列中有进程在等待资源，则唤醒一个阻塞的进程。如果
没有进程等待它，则释放一个资源（给信号量值加一）。
```

在信号量进行 PV 操作时都为原子操作（因为它需要保护临界资源）。  

原子操作：单指令的操作称为原子的，单条指令的执行是不会被打断的  

#### IPC信号量函数

##### 创建或获取一个信号量  

semget 函数的功能是创建或者获取一个已经创建的信号量，如果成功则返回对应的信号量标识符，失败则返回-1。  

```
int semget(key_t key, int nsems, int semflg);
- key：参数 key 用来标识系统内的信号量可以使用ftok函数创建或者是类似（key_t）123
- nsems：参数用于在创建信号量的时候，表示可用的信号量数目。
- semflg：参数用来指定标志位
	* PC_CREAT：IPC_CREAT 标志创建新的信号量，即使该信号量已经存在（具有同一个键值的信号量已在系统中存在），也不会出错。
	* IPC_EXCL：同时使用 IPC_EXCL 标志可以创建一个新的唯一的信号量，此时如果该信号量已经存在，该函数会返回出错。
	* mode：创建文件模式 0666
	
创建信号量时，还受到以下系统信息的影响:
• SEMMNI：系统中信号量总数的最大值。
• SEMMSL：每个信号量中信号量元素个数的最大值。
• SEMMNS：系统中所有信号量中的信号量元素总数的最大值。
```

#### 信号量PV操作

##### 信号量的PV操作

semop() 函数对信号量进行 PV 操作 。

```
int semop(int semid, struct sembuf *sops, size_t nsops);
- semid： System V 信号量的标识符，用来标识一个信号量
- sops：指向一个 struct sembuf 结构体数组的指针，该数组是一个信号量操作数组
	struct sembuf
    {
        unsigned short int sem_num; /* 信号量的序号从 0 ~ nsems-1 */
        short int sem_op; /* 对信号量的操作， >0, 0, <0 */
        short int sem_flg; /* 操作标识： 0， IPC_WAIT, SEM_UNDO */
    };
    * set_num：用于标识信号量中的第几个信号量， 0 表示第 1 个， 1 表示第 2 个， nsems -1表示最后一个。
    * sem_op：sem_op 标识对信号量的所进行的操作类型
    	~ sem_op > 0 表示进程未使用或者使用完毕交回资源，表示信号量V(释放操作)，sem_op 的值加到该信号量的信号量当前值 semval
    	~ sem_op < 0 表示进程需要使用资源，表示信号量P操作（获取资源），当信号量当前值 semval 大于或者等于 -sem_op 时， semval 减掉 sem_op 的绝对值，为该进程分配对应数目的资源。
    	~ sem_op = 0 表示进程要阻塞等待，直至信号量当前值 semval 变为 0
    * sem_flg，信号量操作的属性标志
        ~ IPC_NOWAIT 使对信号量的操作是非阻塞的，即指定了该标志，调用进程在信号量的值不满足条件的情况下不会被阻塞，而是直接返回-1，并将 errno 设置为 EAGAIN。
        ~ SEM_UNDO 维护进程对信号量的调整值，进程退出的时候会自动还原它对信号量的操作
        ~ 0 表示正常操作
- nsops：表示上面 sops 数组的数量，如只有一个 sops 数组， nsops 就设置为 1
```

##### semctl属性函数

semctl 函数主要是对信号量集的一系列控制操作，根据操作命令 cmd 的不同，执行不同的操作，
第四个参数是可选的。  

```
int semctl(int semid, int semnum, int cmd, ...);
- semid： System V 信号量的标识符；
- semnum：表示信号量集中的第 semnum 个信号量。它的取值范围： 0 ~ nsems-1 。
- cmd：操作命令，主要有以下命令：
    * IPC_STAT：获取此信号量集合的 semid_ds 结构，存放在第四个参数的 buf 中。
    * IPC_SET：通过第四个参数的 buf 来设定信号量集相关联的 semid_ds 中信号量集合权限为 sem_perm 中的 uid， gid， mode。
    * IPC_RMID：从系统中删除该信号量集合。
    * GETVAL：返回第 semnum 个信号量的值。
    * SETVAL：设置第 semnum 个信号量的值，该值由第四个参数中的 val 指定。
    * GETPID：返回第 semnum 个信号量的 sempid，最后一个操作的 pid。
    * GETNCNT：返回第 semnum 个信号量的 semncnt。等待 semval 变为大于当前值的线程数。
    * GETZCNT：返回第 semnum 个信号量的 semzcnt。等待 semval 变为 0 的线程数。
    * GETALL：去信号量集合中所有信号量的值，将结果存放到的 array 所指向的数组。
    * SETALL：按 arg.array 所指向的数组中的值，设置集合中所有信号量的值。
- 第四个参数是可选的：如果使用该参数，该参数的类型为 union semun，它是多个特定命令的联合体
	union semun {
        int val; /* Value for SETVAL */
        struct semid_ds *buf; /* Buffer for IPC_STAT, IPC_SET */
        unsigned short *array; /* Array for GETALL, SETALL */
        struct seminfo *__buf; /* Buffer for IPC_INFO
        (Linux-specific) */
        };
```

