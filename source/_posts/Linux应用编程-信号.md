---
title: Linux应用编程-信号
date: 2022-10-26 20:54:06
tags: Linux应用开发
---

## Linux应用编程-信号

##### Linux系统支持的信号

```
使用kill -l查看信号
信号分类：
- 信号值为1-31的信号属于非实时信号（不可靠信号）（不支持排队处理）
- 信号值为34-64的信号为实时信号 （可靠信号）（支持排队处理）

以下是常用的一些信号：
SIGHUP 1 关闭终端 终止 
SIGINT 2 ctrl+c 终止 
SIGQUIT 3 ctrl+\ 终止+转储 
SIGABRT 6 abort() 停止+转储 
SIGPE 8 算术错误 终止 
SIGKILL 9 kill -9 pid 终止，不可捕获/忽略 
SIGUSR1 10 自定义 忽略 
SIGSEGV 11 段错误 终止+转储 
SIGUSR2 12 自定义 忽略 
SIGALRM 14 alarm() 终止 
SIGTERM 15 kill pid 终止 
SIGCHLD 17 (子)状态变化 忽略 
SIGTOP 19 ctrl+z 暂停，不可忽略/捕获

使用kill或者是pkill可以杀死进程
• kill + pid 或者 kill + -9 + pid
• pkill + 需要杀死的进程名称
```

##### 信号处理

信号的处理方式（实时信号 非实时信号）

```
- 忽略信号
- 捕捉信号
- 让信号默认动作起作用
```

##### 信号API函数

捕获信号API函数：

- signal函数

```
//signal函数
typedef void (*sighandler_t)(int); //信号处理函数
sighandler_t signal(int signum, sighandler_t handler); //signal 捕获函数
- signum 指定捕获的信号
- handler 用户处理信号的方式
	• SIG_IGN 忽略该信号
	• SIG_DFL 采用系统默认方式处理信号
	• 使用信号处理函数void sighandler_t(int);
返回值：成功 上一次设置的handler 失败SIG_ERR

```

- sigaction函数

```
//sigaction函数
struct sigaction {
    void (*sa_handler)(int); 是捕获信号后的处理函数
    void (*sa_sigaction)(int, siginfo_t *, void *); 是扩展信号处理函数
    sigset_t sa_mask; 是信号掩码 它指定了在执行信号处理函数期间阻塞的信号的掩码，被设置
                      在该掩码中的信号，在进程响应信号期间被临时阻塞。除非使用 SA_NODEFER 标志
                      否则即使是当前正在处理的响应的信号再次到来的时候也会被阻塞。
    int sa_flags; 系列用于修改信号处理过程行为的标志
    void (*sa_restorer)(void);
};
sa_flags：
- SA_NOCLDSTOP 如果 signum 是 SIGCHLD，则在子进程停止或恢复时，不会传信号给调用 sigaction() 函数的进程。
- SA_NOCLDWAIT 它表示父进程在它的子进程终止时不会收到 SIGCHLD 信号，这时子进程终止则不会成为僵尸进程。
- SA_NODEFER 不要阻止从其自身的信号处理程序中接收信号，使进程对信号的屏蔽无效，即在信号处理函数执行期间仍能接收这个信号
- SA_RESETHAND 信号处理之后重新设置为默认的处理方式。
- SA_SIGINFO 指示使用 sa_sigaction 成员而不是使用 sa_handler 成员作为信号处理函数

int sigaction(int signum, const struct sigaction *act,struct sigaction *oldact);
- signum :指定捕获的信号
- act :struct sigaction类型的结构体
- oldact :返回原有的信号处理参数，一般设置为 NULL 即可。
```

发送信号API函数：

- kill函数

```
kill函数向包括它本身在内的其他进程发送一个信号
int kill(pid_t pid,int sig);
- pid :pid取值
    • pid > 1：将信号 sig 发送到进程 ID 值为 pid 指定的进程。
    • pid = 0：信号被发送到所有和当前进程在同一个进程组的进程。
    • pid = -1：将 sig 发送到系统中所有的进程，但进程 1（init）除外。
    • pid < -1：将信号 sig 发送给进程组号为-pid （pid 绝对值）的每一个进程。
- sig :发送的信号值
-函数返回值：0 成功 1失败
```

- raise函数

```
raise() 函数只是进程向自身发送信号的，而没有向其他进程发送信号.给当前进程发送指定信号（自己给自己发信号）
kill(getpid(),sig) 等同于 raise(sig)
int raise(int sig);
函数只有一个参数 sig，它代表着发送的信号值，如果发送成功则返回 0，发送失败则返回-1
```

- alarm函数

```
alarm() 也称为闹钟函数，它可以在进程中设置一个定时器，当定时器指定的时间 seconds 到时，它就向进程发送 SIGALRM 信号。
unsigned int alarm(unsigned int seconds);
如果在 seconds 秒内再次调用了 alarm() 函数设置了新的闹钟，则新的设置将覆盖前面的设置，即之前设置的秒数被新的闹钟时间取代。它的返回值是之前闹钟的剩余秒数，如果之前未设闹钟则返回 0。
```

##### 信号集处理函数

- 屏蔽信号集：屏蔽某些信号

  ```
  - 手动去调用信号集函数
  - 某些场景系统自动取设置信号集
  ```

- 未处理信号集：如果信号集被屏蔽，则记录在未处理信号集中，直到屏蔽信号集解除对信号的屏蔽才会去处理

  ```
  - 非实时信号（1-31）：不排队，只留一个（不管来多少信号，只保留最近的一个信号，其他信号全部丢掉）
  - 实时信号（34-64）：排队，保留全部信号
  ```

- 信号集相关API

  ```
  int sigemptyset(sigset_t *set); //将信号集合初始化为0函数 不屏蔽信号
  int sigfillset(sigset_t *set); //将信号集合初始化为1函数 屏蔽信号
  int sigaddset(sigset_t *set); //将信号集合某一位设置为1
  int sigdelset(sigset_t *set); //将信号集合某一位设置为0
  int sigismember(const sigset_t *set, int signum); //判断某信号是否在屏蔽信号集里面
  //该函数可以根据参数指定的方法修改进程的信号屏蔽字
  //将屏蔽信号赋值给屏蔽信号集
  int sigprocmask(int how, const old_kernel_sigset_t *set,old_kernel_sigset_t *oldset);
  - how：
      •  SIG_BLOCK:屏蔽某个信号，添加的信号屏蔽字不覆盖之前的，这是一个并集的关系（屏蔽集 |set ）
      •  SIG_UNBLOCK:希望解除BLOCK的信号集合。解除信号集的屏蔽（屏蔽集 &~ set）
      •  SIG_SETMASK:该进程的信号屏蔽是set指向的值。（直接等于我们设置的信号集合）
  - set：需要传入的屏蔽信号集
  - oldset：保存旧的屏蔽集的值，NULL表示不保存
  ```

  

