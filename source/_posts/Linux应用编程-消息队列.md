---
title: Linux应用编程-消息队列
date: 2022-10-27 21:54:25
tags: Linux应用开发
---

## Linux应用编程-消息队列

##### 消息队列的基本概念

消息队列提供了一种从一个进程向另一个进程发送一个数据块的方法。每个数据块都被认为含有一个类型，接收进程可以独立地接收含有不同类型的数据结构。  

消息队列特点：

```
- 在消息队列中，发送数据用 msgsnd()，接收数据用msgrcv()，消息队列对每个数据都有一个最大长度的限制。
- 消息队列也可以独立于发送和接收进程而存在，在进程终止时，消息队列及其内容并不会被删除。
- 消息队列提供有格式的字节流。
- 消息队列是面向记录的，其中的消息具有特定的格式以及特定的优先级，接收程序可以通过消息类型有选择地接收数据
- 消息队列可以实现消息的随机查询，消息不一定要以先进先出的顺序接收，也可以按消息的类型接收。
```

##### 消息队列API函数

- 创建或打开消息队列API函数msgget()  

  ```
  msgget() 函数创建的消息队列的数量会受到系统可支持的消息队列数量的限制；
  msgget() 函数的作用是创建或获取一个消息队列对象，并返回消息队列标识符。
  int msgget(key_t key, int msgflg);
  - key：消息队列的关键字值，多个进程可以通过它访问同一个消息队列。可通过ftok函数创建
  	• key_t ftok(const char *pathname, int proj_id);
  		* path：合法路径
  		* proj_id：一个整数
  - msgflg：表示创建的消息队列的标志参数
  	•  IPC_CREAT
  	•  IPC_EXCL
  	•  mode
  	这些参数是可以通过“｜”运算符联合起来的，因为它始终是 int 类型的参数。如 msgflag使用参数 		IPC_CREAT | 0666 时表示，创建或返回已经存在的消息队列的标识符，且该消息队列的存取权限为0666。
  如果是 IPC_CREAT 为真表示：如果内核中不存在关键字与 key 相等的消息队列，则新建一个消息队列；如果存在这样的消息队列，返回此消息队列的标识符。
  而如果为 IPC_CREAT | IPC_EXCL 表示如果内核中不存在键值与 key 相等的消息队列，则新建一个消息队列；如果存在这样的消息队列则报错。
  mode 指 IPC 对象存取权限，它使用 Linux 文件的数字权限表示方式，如 0600， 0666等。
  
  返回值： 成功返回队列表示符，失败返回 -1
  记录在error中的错误代码：
  – EACCES：指定的消息队列已存在，但调用进程没有权限访问它
  – EEXIST： key 指定的消息队列已存在，而 msgflg 中同时指定 IPC_CREAT 和 IPC_EXCL标志
  – ENOENT： key 指定的消息队列不存在同时 msgflg 中没有指定 IPC_CREAT 标志
  – ENOMEM：需要建立消息队列，但内存不足
  – ENOSPC：需要建立消息队列，但已达到系统的限制
  
  注意：当 key 被指定为 IPC_PRIVATE 时，系统会自动产生一个未用的 key 来对应一个新的消息队列对象，这个消息队列一般用于进程内部间的通信。
  
  
  ```

  

- 发送消息使用的API函数是 msgsnd() 

  ```
  msgsnd() 函数把消息发送到已打开的消息队列末尾;  
  int msgsnd(int msqid, const void *msgp, size_t msgsz, int msgflg);
  - msqid：消息队列标识符。
  - msgp：消息队列结构体，msgp 可以是任何类型的结构体，但第一个字段必须为 long 类型。
  	• struct s_msg{
          long type; /* 必须大于 0, 消息类型 */
          char mtext[１ ]; /* 消息正文，可以是其他任何类型 */
        } msgp;
  – msgsz：要发送消息的大小，不包含消息类型占用的 4 个字节，即 mtext 的长度。
  - msgflg：消息队列标志位参数
  	• 0：当消息队列满时， msgsnd() 函数将会阻塞，直到消息能写进消息队列；
  	• IPC_NOWAIT：当消息队列已满的时候， msgsnd() 函数不等待立即返回；
  	• IPC_NOERROR：若发送的消息大于 size 字节，则把该消息截断，截断部分将被丢弃，且不通知发送进程。
  返回值：成功返回0，失败返回-1
  记录在error中的错误代码：
  – EAGAIN：参数 msgflg 设为 IPC_NOWAIT，而消息队列已满。
  – EIDRM：标识符为 msqid 的消息队列已被删除。
  – EACCESS：无权限写入消息队列。
  – EFAULT：参数 msgp 指向无效的内存地址。
  – EINTR：队列已满而处于等待情况下被信号中断。
  – EINVAL：无效的参数 msqid、 msgsz 或参数消息类型 type 小于 0。
  
  msgsnd() 解除阻塞的条件有以下三个条件：
  - 消息队列中有容纳该消息的空间。
  - msqid 代表的消息队列被删除。
  - 调用 msgsnd 函数的进程被信号中断。
  
  ```

  

- 接收消息使用的API函数是 msgrcv()  

  ```
  msgrcv() 函数是从标识符为 msqid 的消息队列读取消息并将消息存储到 msgp 中，读取后把此消息从消息队列中删除.
  ssize_t msgrcv(int msqid, void *msgp, size_t msgsz, long msgtyp, int␣,msgflg);
  msqid：消息队列标识符。
  - msgp：存放消息的结构体，结构体类型要与 msgsnd() 函数发送的类型相同。
  - msgsz：要接收消息的大小，不包含消息类型占用的 4 个字节。
  - msgtyp 有多个可选的值：如果为 0 则表示接收第一个消息，如果大于 0 则表示接收类型等于 msgtyp 的第一个消息，而如果小于 0 则表示接收类型等于或者小于 msgtyp 绝对值的第一个消息。
  - msgflg 用于设置接收的处理方式，取值情况如下：
      • IPC_EXCEPT：与 msgtype 配合使用返回队列中第一个类型不为 msgtype 的消息
      • IPC_NOWAIT：若在消息队列中并没有相应类型的消息可以接收，则函数立即返回，此时错误码为 ENOMSG
      • 0: 阻塞式接收消息，没有该类型的消息 msgrcv 函数一直阻塞等待
      • IPC_NOERROR：如果队列中满足条件的消息内容大于所请求的 size 字节，则把该消息截断，截断部分将被丢弃
  返回值： msgrcv() 函数如果接收消息成功则返回实际读取到的消息数据长度，否则返回-1
  错误代码：存放在error中
  – E2BIG：消息数据长度大于 msgsz 而 msgflag 没有设置 IPC_NOERROR
  – EIDRM：标识符为 msqid 的消息队列已被删除
  – EACCESS：无权限读取该消息队列
  – EFAULT：参数 msgp 指向无效的内存地址
  – ENOMSG：参数 msgflg 设为 IPC_NOWAIT，而消息队列中无消息可读
  – EINTR：等待读取队列内的消息情况下被信号中断
  
  msgrcv() 函数解除阻塞的条件也有三个：
  - 消息队列中有了满足条件的消息。
  - msqid 代表的消息队列被删除。
  - 调用 msgrcv() 函数的进程被信号中断。
  ```

  

- 控制消息队列使用的APIs函数是 msgctl()  

  ```
  消息队列是可以被用户操作的，比如设置或者获取消息队列的相关属性，那么可以通过 msgctl()函数去处理它。
  int msgctl(int msqid, int cmd, struct msqid_ds *buf);
  - msqid：消息队列标识符。
  - cmd 用于设置使用什么操作命令
      • IPC_SET 设置消息队列的属性，要设置的属性需先存储在结构体 msqid_ds 类型的 buf中，可设置的属性包括： msg_perm.uid、 msg_perm.gid、 msg_perm.mode 以及 msg_qbytes，储存在结构msqid_ds 中。
      • IPC_RMID 立即删除该 MSG，并且唤醒所有阻塞在该 MSG 上的进程，同时忽略第三个参数。
      • IPC_STAT 获取该 MSG 的信息，获取到的信息会储存在结构体 msqid_ds 类型的 buf 中。
      • IPC_INFO 获得关于当前系统中 MSG 的限制值信息。
      • MSG_INFO 获得关于当前系统中 MSG 的相关资源消耗信息。
      • MSG_STAT 同 IPC_STAT，但 msgid 为该消息队列在内核中记录所有消息队列信息的数组的下标，因此通过迭代所有的下标可以获得系统中所有消息队列的相关信息。
  - buf：相关信息结构体缓冲区。
      • 返回值：
      • 成功： 0
      • 出错： -1
  错误代码：
  - EACCESS：参数 cmd 为 IPC_STAT，确无权限读取该消息队列。
  - EFAULT：参数 buf 指向无效的内存地址。
  - EIDRM：标识符为 msqid 的消息队列已被删除。
  - EINVAL：无效的参数 cmd 或 msqid。
  - EPERM：参数 cmd 为 IPC_SET 或 IPC_RMID，却无足够的权限执行。
  ```

  

