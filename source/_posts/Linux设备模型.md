---
title: Linux设备模型
date: 2022-11-23 20:31:45
tags: Linux设备驱动
---

## Linux 设备模型

### 设备模型概念

- device（设备）：挂载在某个的物理设备
- dirver（驱动）：初始化物理设备和提供一些操作方式
- bus（总线）：管理挂载在bus上面的设备和驱动
- class （类）：管理相同功能的设备类别，进行统一管理

sys/bus 目录下保存的是注册了的总线类型

devices目录下保存的是挂载在该总线上面的所有设备

driver目录下保存的是挂载在总线上面的所有驱动

sys/class 目录下保存了在所有注册在kernel里面的设备类型

### 总线（bus）

总线驱动则负责实现总线的各种行为，其管理着两个链表，分别是添加到该总线的设备链表以及 注册到该总线的驱动链表。当你向总线添加（移除）一个设备（驱动）时，便会在对应的列表上 添加新的节点，同时对挂载在该总线的驱动以及设备进行匹配，在匹配过程中会忽略掉那些已经 有驱动匹配的设备。  

#### bus_type：用来描述总线

```
struct bus_type {
    const char *name;
    const struct attribute_group **bus_groups;
    const struct attribute_group **dev_groups;
    const struct attribute_group **drv_groups;
    int (*match)(struct device *dev, struct device_driver *drv);
    int (*uevent)(struct device *dev, struct kobj_uevent_env *env);
    int (*probe)(struct device *dev);
    int (*remove)(struct device *dev);
    ...
    struct subsys_private *p;
}
```

- name :  指定总线的名称，当新注册一种总线类型时，会在/sys/bus 目录创建一个新的目录， 目录名就是该参数的值。
- bus_groups，dev_groups，drv_groups：分别表示驱动、设备以及总线的属性。  
- match：总线用来匹配新注册的设备或者是新的驱动。
- uevent：总线上面发生添加或移除，就会调用该回调函数。
- probe：总线上面的驱动和设备匹配成功之后，执行该回调函数。
- remove：设备从总线上面移除是回调该处理函数。
- p：用来存放私有数据。

#### bus总线注册和注销

1、bus总线注册：注册成功后会在/sys/bus/ 目录下面生成 xxx 文件 /sys/bus/xxx。

```
int bus_register(struct bus_type *bus);  
```

2、bus总线注销：注销bus总线

```
void bus_unregister(struct bus_type *bus);
```

### 设备（device）

#### device结构体描述物理设备

```
struct device {  
    const char *init_name;
    struct device *parent;
    struct bus_type *bus;
    struct device_driver *driver;
    void *platform_data;
    void *driver_data;
    struct device_node *of_node;
    dev_t devt;
    struct class *class;
    void (*release)(struct device *dev);
    const struct attribute_group **groups;
    struct device_private *p;
}
```

- name ：device（设备）名称
- parent：该设备的父对象（在哪一个目录下面挂载）
- bus：挂载在哪一个总线
- of_node：存放设备树中匹配节点
- platform_data：特定设备的私有数据
- driver_data：驱动的私有数据
- class：指向了该设备对应类  
- devt：标识设备设备号
- release：设备被注销时，调用该函数
- groups：设备属性组（设备的属性文件）

#### 设备(device)的注册和注销

1、设备的注册：注册成功时会在该设备注册的总线目录下创建设备

```
int device_register(struct device *dev);  
```

2、设备的注销

```
void device_unregister(struct device *dev);
```

### driver（驱动）

使用device_driver结构体来描述驱动

```
struct device_driver {
    const char *name;
    struct bus_type *bus;
    struct module *owner;
    const char *mod_name;
    const struct of_device_id
    int (*probe) (struct device *dev);
    int (*remove) (struct device *dev);
    ...
    const struct attribute_group **groups;
    struct driver_private *p;
}
```

- name：driver（驱动）名称
- bus：驱动依赖于哪个总线  
- owner：该驱动的拥有者  ，一般设置为 THIS_MODULE  
- of_device_id：指定该驱动支持的设备类型  
- probe：驱动与设备匹配成功之后，执行该回调函数
- remove：设备从操作系统中拔出，或者系统重启，会执行该回调函数
- groups：驱动属性文件组

#### 驱动（driver）的注册和注销

1、驱动的注册：驱动注册成功之后会在该总线下面创建driver文件

```
int driver_register(struct device_driver *drv);
```

2、驱动的注销

```
void driver_unregister(struct device_driver *drv);
```

### 属性文件

#### attribute属性文件

1、属性文件：attribute 结构体来描述/sys 目录下的文件  

```
struct attribute {
    const char *name;
    umode_t mode;
};
```

- name : 指定文件的文件名；
-  mode : 指定文件的权限，  

2、属性文件组

```
struct attribute_group {
    const char *name;
    struct attribute **attrs;
}；
```

#### 设备属性文件

设备属性文件接口：

```
struct device_attribute {
    struct attribute attr;
    ssize_t (*show)(struct device *dev, struct device_attribute *attr,char *buf);
    ssize_t (*store)(struct device *dev, struct device_attribute *attr,
    const char *buf, size_t count);
```

- attr：设备属性文件
- show：属性文件接口，是cat命令的回调函数接口
- store：属性文件接口，是echo命令的回调接口

设备文件的创建：在挂载总线目录下面创建device文件

```
extern int device_create_file(struct device *device,
    const struct device_attribute *entry);
```

设备文件的注销：

```
extern void de vice_remove_file(struct device *dev,  
```

device是需要填充好的设备结构体，entry是自己定义的设备属性文件。

定义和填充device_attribute类型的变量：

```
#define DEVICE_ATTR(_name, _mode, _show, _store)\
struct device_attribute dev_attr_##_name = __ATTR(_name, _mode, _show, _store)
```

- _name：设备结构体的文件名
- _mode：文件权限（rwx）
- _show：cat回调函数实现
- _store：echo回调函数实现

#### 驱动属性文件

驱动属性文件：

```
struct driver_attribute {
    struct attribute attr;
    ssize_t (*show)(struct device_driver *driver, char *buf);
    ssize_t (*store)(struct device_driver *driver, const char *buf,size_t count);
}；
```

结构体成员同上面设备文件结构体一样。

驱动文件的创建：在挂载总线目录下面创建driver文件

```
extern int __must_check driver_create_file(struct device_driver *driver,
    const struct driver_attribute *attr);
```

驱动文件的注销：

```
extern void driver_remove_file(struct device_driver *driver,
    const struct driver_attribute *attr);
```

driver是需要填充好的驱动结构体，attr是自己定义的驱动属性文件。

device是需要填充好的驱动结构体，attr是自己定义的设备属性文件。

```
#define DRIVER_ATTR_RW(_name) \
struct driver_attribute driver_attr_##_name = __ATTR_RW(_name)
```

同上面设备结构体一样。

#### BUS总线属性文件

bus总线结构体：

```
struct bus_attribute {
    struct attribute attr;
    ssize_t (*show)(struct device_driver *driver, char *buf);
    ssize_t (*store)(struct device_driver *driver, const char *buf,size_t count);
}；
```

结构体成员同上面设备文件结构体一样。

bus总线的注册：在/sys/bus目录下面创建文件

```
extern int __must_check bus_create_file(struct bus_type *,
struct bus_attribute *);
```

bus总线的注销：

```
extern void bus_remove_file(struct bus_type *, struct bus_attribute *);
```

创建bus结构体和填充该结构体

```
#define BUS_ATTR(_name, _mode, _show, _store) \
struct bus_attribute bus_attr_##_name = __ATTR(_name, _mode, _show,_store)
```

### 创建BUS，device，driver文件

#### bus总线的创建步骤：

bus_type类型结构体：

```
struct bus_type {
    const char      *name;
    const char      *dev_name;
    struct device       *dev_root;
    const struct attribute_group **bus_groups;
    const struct attribute_group **dev_groups;
    const struct attribute_group **drv_groups;

    int (*match)(struct device *dev, struct device_driver *drv);
    int (*uevent)(struct device *dev, struct kobj_uevent_env *env);
    int (*probe)(struct device *dev);
    int (*remove)(struct device *dev);
    void (*shutdown)(struct device *dev);

    int (*online)(struct device *dev);
    int (*offline)(struct device *dev);

    int (*suspend)(struct device *dev, pm_message_t state);
    int (*resume)(struct device *dev);
    ...
};
```

1、主要实现match匹配函数的回调函数

```
int (*match)(struct device *dev, struct device_driver *drv);
```

2、填充bus_type结构体的name,match等成员（用于总线注册），并将总线导出

```
static struct bus_type xbus = {
.name = "xbus",
.match = xbus_match,
};

EXPORT_SYMBOL(xbus);
```

3、实现属性文件的store,show的回调函数实现，并且创建填充bus_attribute结构体，并且导出到用户空间。

```
ssize_t (*show)(struct bus_type *bus, char *buf);
ssize_t (*store)(struct bus_type *bus, const char *buf, size_t count);

BUS_ATTR(xbus_test, S_IRUSR, show, store);
```

4、使用bus_register注册总线和使用bus_create_file创建总线文件。

```
bus_register(&xbus);
bus_create_file(&xbus, &bus_attr_xbus_test);
```

#### 设备文件的创建步骤：

创建成功后会在/sys/bus/xbus/devices/目录下创建xdev设备文件

1、release回调函数的实现

```
void    (*release)(struct device *dev);
```

2、定义设备，并且填充结构体成员，挂载在（xbus）某个总线上面。

```
extern struct bus_type xbus;

static struct device xdev = {
    .init_name = "xdev", /*device file name*/
    .bus = &xbus, /*xdev belong to xbus*/
    .release = xdevice_release,
};
```

3、定义设备属性（device_attribute），实现show,store属性回调函数，并填充到结构体

```
ssize_t (*show)(struct device *dev, struct device_attribute *attr,
            char *buf);
ssize_t (*store)(struct device *dev, struct device_attribute *attr,
             const char *buf, size_t count);
DEVICE_ATTR(xdev_id, S_IRUSR|S_IWUSR, show, store);
```

4、使用device_rigister和device_create_file将设备结构体和属性文件注册到内核。

```
device_register(&xdev);
device_create_file(&xdev, &dev_attr_xdev_id);
```

#### 驱动属性文件的创建

创建成功后会在/sys/bus/xbus/driver/目录下创建xdev驱动文件

1、实现probe和remove函数的回调

```
int (*probe) (struct device *dev);
int (*remove) (struct device *dev);
```

2、创建xdriver对象，并且为xdriver对象填充数据。并且初始化挂载在那个总线上面

```
static struct device_driver xdriver = {
    .name = "xdev",
    .probe = probe,
    .bus = &xbus,
    .remove = remove,
};
```

3、创建属性文件对象，并且实现show,store回调函数，和填充对象数据

```
ssize_t (*show)(struct device_driver *driver, char *buf);
ssize_t (*store)(struct device_driver *driver, const char *buf, size_t count);

DEVICE_ATTR(xdev,S_IRUSR|S_IWUSR,show,store);
```

4、驱动的注册（driver_register  ）和属性文件的注册（driver_create_file  ）

```
driver_register(&xdrv);
driver_create_file(&xdriver, &driver_attr_drvname);
```