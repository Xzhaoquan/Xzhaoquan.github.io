---
title: LED字符设备
date: 2022-09-14 22:01:58
tags: linux驱动开发
---

## LED字符设备

##### 1、实现虚拟IO映射和读写

- 虚拟地址映射

  ```
  使用ioremap函数进行虚拟地址映射
  函数原型：void __iomem *ioremap(resource_size_t res_cookie, size_t size);
  参数：
  res_cookie：实际的物理地址
  size：映射长度(一般4个字节)
  返回值： void __iomem*类型的指针，指向被映射的虚拟地址
  
  __iomem:主要是用于编译器的检查地址在内核空间的有效性
  
  example:
  #define CCM_CCGR1_BASE     (0x020C406C)
  static void __iomem *IMX6ULL_CCM_CCGR1;
  IMX6ULL_CCM_CCGR1 = ioremap(CCM_CCGR1_BASE,4);
  ```

- 虚拟地址映射的取消

  ```
  使用iounmap函数取消虚拟地址映射
  函数原型：void iounmap(volatile void __iomem *iomem_cookie);
  参数：
  iomem_cookie：指向虚拟地址的指针
  
  example：
  iounmap(IMX6ULL_CCM_CCGR1);
  ```

- 虚拟地址的读写

  ```
  //虚拟地址的读取 8 16 32
  static inline u8 ioread8(const volatile void __iomem *addr) //8位的读取
  static inline u16 ioread16(const volatile void __iomem *addr) //16位的读取
  static inline u32 ioread32(const volatile void __iomem *addr) //32位的读取
  
  参数：
  addr：void __iomem *类型的虚拟地址
  返回值：u32/u16/u8类型的数据
  
  //虚拟地址的写 8 16 32
  static inline void iowrite8(u8 value, volatile void __iomem *addr)//写入8位数据
  static inline void iowrite16(u8 value, volatile void __iomem *addr)//写入16位数据
  static inline void iowrite32(u32 value, volatile void __iomem *addr)//写入32位数据
  
  参数：
  value：写入一个u32/u16/u8类型的数据
  addr：void __iomem *类型的虚拟地址
  ```

  

##### 2、实现驱动接口

- file_operations 结构体的实现

  ```
  //实现file_operation结构体
  static struct file_operations led_chrdev_fops = {
      .owner = THIS_MODULE,
      .open = led_open,
      .write = led_write,
      .release = led_release,
  };
  ```

- 操作接口函数的实现

  ```
  //write release open函数的实现
  static int led_open(struct inode *inode, struct file *filp)
  static int led_release(struct inode *inode, struct file *filp)
  static ssize_t led_write(struct file *filp, const char __user *buf,size_t count, loff_t *ppos)
  ```

##### 3、数据的拷贝

- copy_from_user拷贝用户空间的数据

  ```
  copy_from_user(void *to, const void __user *from, unsigned long n);
  参数：
  to：将数据拷贝到内核地址
  from：需要拷贝的用户空间的地址
  n：需要拷贝数据的长度
  ```

##### 4、添加、删除LED字符设备

- 使用register_chrdev函数添加LED字符设备（用mknod 创建字符设备文件）

  ```
  //字符设备注册添加
  static inline int register_chrdev(unsigned int major, const char *name,
  				  const struct file_operations *fops)
  参数：
  major：主设备号
  name：设备名字
  fops：file_operations的指针指向操作接口
  
  使用mknod /dev/led c 200 0 //创建一个字符设备/dev/led 主设备号为200 次设备号为0
  
  //字符设备注销
  static inline void unregister_chrdev(unsigned int major, const char *name)
  参数：
  major：主设备号
  name：设备名字
  
  //使用register_chrdev函数注册添加字符设备 注册成功会占用1个主设备号和256多个次设备号
  ```

- 使用其他方式添加字符设备

  ```
  //动态申请主设备号
  alloc_chrdev_region();
  //创建class类
  class_create(); 
  //cdev设备结构体与file_operations相关联
  cdev_init();
  //设备注册-添加设备到cdev_map哈希表中
  ret = cdev_add();
  //创建字符设备文件
  device_create();
  ```

- 使用其他方式删除字符设备

  ```
  //删除字符设备文件
  device_destroy();
  //删除注册的字符设备（注销设备）
  cdev_del();
  //注销设备号
  unregister_chrdev_region();
  //删除设备逻辑类
  class_destroy();
  ```

  



