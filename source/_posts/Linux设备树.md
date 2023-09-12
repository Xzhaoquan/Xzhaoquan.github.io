---
title: Linux设备树
date: 2022-11-27 19:04:04
tags: Linux设备驱动
---

## Linux设备树

### Linux设备树简介

设备树是用来描述硬件平台的硬件资源信息，设备树可以被bootloader（uboot）传递到内核，使内内核可以从设备树中获取硬件信息。

带.dtsi后缀的文件表示的使设备树文件，需要使用设备树文件的话，直接包含设备树文件即可。#include xxx

##### DTS：指.dts格式文件，一种使用ASII文本格式的设备树描述，一个.dts文件对应一个硬件平台。

一般位于/arch/arm/boot/dts目录下。（我们一般修改编写的设备树源码就是这个）

##### DTC：指编译设备树源码的工具，一般需要手动安装。

##### DTB：设备树源码编译生成的文件。

### 设备树框架

#### 设备树详解

##### 设备树源码分析

- 头文件：设备树的头文件是可以使用#include 去应用设备树文件的。#include "imx6ull.dtsi",

  imx6ull.dtsi一般由NXP官方提供。

- 设备树节点：每一个设备树根节点只有一个根节点。其余都是根节点的子节点，子节点也可以包含其他节点。

- 设备树节点追加内容：使用&符号去向节点追加数据。

#### 设备树节点

##### 设备树节点基本格式

设备树中的节点都是按照以下约定命名。

```
node-name@unit-address{
	属性 1 = …
	属性 2 = …
	属性 3 = …
	子节点…
}
```

- node-name节点名称
  - node-name用于指定节点名称，一般是1-31个字符。
  - 根节点没有节点名，直接使用"/“代替这是一个根节点

- @：是一个分隔符
- unit-address：用于指定单元地址，他的值要和”reg“属性的第一个地址一致，若没有"reg"属性可省略。

##### 设备树节点标签

imx6ull.dtsi 头文件中  ，cpu前面多了个cpu0，这个cpu0就是该节点的标签。

```
cpu0: cpu@0
```

通常节点标签是节点名的简写。其他位置需要引用该节点时，可以直接使用节点标签。

##### 设备树节点路径

通过指定从根节点到所需节点的完整路径，可以唯一地标识设备树中的节点， 不同层次的设备树节点名字可以相同，同层次的设备树节点要唯一。  

##### 设备树节点属性

在节点的{}中包含的内容就是节点的属性。通常一个节点包含多个属性信息，这些信息会传递到内核的信息描述中，驱动可以通过API函数去获取这些属性信息。

```
intc: interrupt-controller@a01000 {
    compatible = "arm,cortex-a7-gic";
    #interrupt-cells = <3>;
    interrupt-controller;
    reg = <0xa01000 0x1000>,
    <0xa02000 0x100>;
};
```

- compatible属性：字符串类型的属性。

  - compatible 属性值由一个或多个字符串组成，有多个字符串时使用“,”分隔开。  

  - 设备树中没有代表了一个设备的节点都要有一个compatible属性，（设备驱动在匹配时需要使用compatible来匹配），compatible属性是用来查找节点的方法之一。节点名和节点路径都可以用来查找指定节点。

- model属性：字符串属性类型

  model属性用于指定设备的制造商和型号

  ```
  model = "Embedfire i.MX6ULL Board";
  ```

- status属性：字符串属性类型

  status属性用于指示设备的操作状态；可以通过status去禁止设备或者是启用设备。

  ```
  sound:sound{
  	status = "disable";
  }
  ```

- #address-cell和#size-cells

  #address-cell和#size-cells属性同时存在，在设备树ocrams结构中，他们使用在由子节点的设备节点，可以用于设置节点的reg属性的书写格式

  ```
  soc {
      #address-cells = <1>;
      #size-cells = <1>;
      compatible = "simple-bus";
      interrupt-parent = <&gpc>;
      ranges;
      ocrams: sram@900000 {
      	compatible = "fsl,lpm-sram";
      	reg = <0x900000 0x4000>;
      };
  };
  ```

  reg属性值由一串数字组成，reg = <0x900000 0x4000>中 0x900000是数据地址（地址字段），0x4000是

  长度字段（大小字段）。(cells 是一个 32 位宽的数字  )

  - #address-cells：指定reg属性”地址字段“的长度，
  - #size-cells：指定reg属性”大小字段“的长度，

  ```
  #address-cells = <1>;
  #size-cells = <1>;
  reg = <address size>
  
  #address-cells = <2>;
  #size-cells = <1>;
  reg = <address address size>
  
  #address-cells = <1>;
  #size-cells = <2>;
  reg = <address size size>
  ```

- reg属性：属性值类型，地址，长度数据对。

  reg 属性描述设备资源在其父总线定义的地址空间内的地址。  通常情况下用于表示一块寄存器的
  起始地址（偏移地址）和长度，在特定情况下也有不同的含义  。

- ranges属性：属性值类型，任意数量的 < 子地址、父地址、地址长度 > 编码  

  该属性提供了子节点地址空间和父地址空间的映射（转换）方法，常见格式是ranges = <子地址，父地址，转换长度>。若父地址和子地址空间无需转换，直接省略ranges属性。

  ```
  若#address-cells 和 #size-cells 都为 1
  ranges=<0x0 0x10 0x20> 
  ```

  将子地址0x0-0x20的地址空间映射到父地址0x20-(0x20+0x20)的地址。

- 追加、修改节点内容

  ```
  &cpu0 {
  	dc-supply = <&reg_gpio_dvfs>;
  	clock-frequency = <800000000>;
  }；
  ```

  “&cpu0”表示向“节点标签”为“cpu0”的节点追加数据，这个节点可能定义在本
  文件也可能定义在本文件所包含的设备树文件中  

- 特殊节点：aliases子节点

  作用是为其他节点起一个别名，

  ```
  aliases {
  		can0 = &flexcan1;
  		can1 = &flexcan2;
  		...
  };
  ```

  flexcan1”是一个节点的名字，设置别名后我们可以使用“can0”
  来指代 flexcan1 节点，与节点标签类似。  

- chosen子节点

- 

  ```
  chosen {
  	stdout-path = &uart1;
  };
  ```

  chosen 子节点不代表实际硬件，它主要用于给内核传递参数。这里只设置了“stdout-path =&uart1;”
  一条属性，表示系统标准输出 stdout 使用串口 uart1。  

  

### 获取设备树节点信息

使用of操作函数去获取设备节点资源。

#### 查找节点函数

device_node结构体：

```
struct device_node {
	const char *name;
	const char *type;
	phandle phandle;
	const char *full_name;
	struct fwnode_handle fwnode;

	struct	property *properties;
	struct	property *deadprops;	/* removed properties */
	struct	device_node *parent;
	struct	device_node *child;
	struct	device_node *sibling;
#if defined(CONFIG_OF_KOBJ)
	struct	kobject kobj;
#endif
	unsigned long _flags;
	void	*data;
#if defined(CONFIG_SPARC)
	const char *path_component_name;
	unsigned int unique_id;
	struct of_irq_controller *irq_trans;
#endif
};
```

- name： 节点中属性为 name 的值  

- type： 节点中属性为 device_type 的值  

- full_name： 节点的名字，在 device_node 结构体后面放一个字符串， full_name 指向它  

- properties： 链表，连接该节点的所有属性  

- parent： 指向父节点  

- child： 指向子节点  

- sibling： 指向兄弟节点  

  

##### 1、根据节点路径寻找节点函数（推荐）

获取device_node结构体；

```
struct device_node *of_find_node_by_path(const char *path)
```

- path： 指定节点在设备树中的路径  

返回值：device_node： 结构体指针  ，如果查找失败则返回 NULL  

得到device_node 结构体之后我们就可以使用其他 of 函数获取节点的详细信息  

##### 2、根据节点名字寻找节点函数（不建议）

```
struct device_node *of_find_node_by_name(struct device_node *from,
const char *name);
```

- from： 指定从哪个节点开始查找，它本身并不在查找行列中，只查找它后面的节点，如果
  设置为 NULL 表示从根节点开始查找。  

- name： 要寻找的节点名。  

返回值：device_node： 结构体指针  ，如果查找失败则返回 NULL  

##### 3、根据节点类型寻找节点函数（不建议）

```
struct device_node *of_find_node_by_type(struct device_node *from，
constchar *type)
```

- from： 指定从哪个节点开始查找，它本身并不在查找行列中，只查找它后面的节点，如果
  设置为 NULL 表示从根节点开始查找。  

- type： 要查找节点的类型，这个类型就是 device_node-> type。  

返回值：device_node： 结构体指针  ，如果查找失败则返回 NULL  

##### 4、根据节点类型和compatible属性寻找节点函数（不建议 ）

```
struct device_node *of_find_compatible_node(struct device_node *from,
const char *type, const char *compatible)
```

- from： 指定从哪个节点开始查找，它本身并不在查找行列中，只查找它后面的节点，如果
  设置为 NULL 表示从根节点开始查找。  

- type： 要查找节点的类型，这个类型就是 device_node-> type。  

- compatible： 要查找节点的 compatible 属性。  

返回值：device_node： 结构体指针  ，如果查找失败则返回 NULL  

##### 5、根据匹配表寻找节点函数

```
static inline struct device_node *of_find_matching_node_and_match(
struct device_node *from, const struct of_device_id *matches,
const struct of_device_id **match)
```

- from： 指定从哪个节点开始查找，它本身并不在查找行列中，只查找它后面的节点，如果
  设置为 NULL 表示从根节点开始查找。  
- matches： 源匹配表，查找与该匹配表想匹配的设备节点。  

- of_device_id： 结构体如下。  

  ```
  struct of_device_id {
  	char	name[32];
  	char	type[32];
  	char	compatible[128];
  	const void *data;
  };
  ```

  - name： 节点中属性为 name 的值  
  - type： 节点中属性为 device_type 的值  
  - compatible： 节点的名字，在 device_node 结构体后面放一个字符串， full_name 指向它  
  - data： 链表，连接该节点的所有属性  

返回值：device_node： 结构体指针  ，如果查找失败则返回 NULL  

##### 6、寻找父节点函数

```
struct device_node *of_get_parent(const struct device_node *node)  
```

- node： 指定谁（节点）要查找父节点。  

返回值：device_node： device_node 类型的结构体指针，保存获取得到的节点。  失败返回NULL

##### 7、寻找子节点函数

```
struct device_node *of_get_next_child(const struct device_node *node,
struct device_node *prev)
```

- node： 指定谁（节点）要查找它的子节点  

- prev： 前一个子节点，寻找的是 prev 节点之后的节点。这是一个迭代寻找过程，例如寻找
  第二个子节点，这里就要填第一个子节点。参数为 NULL 表示寻找第一个子节点。  

返回值：device_node： device_node 类型的结构体指针，保存获取得到的节点。  失败返回NULL

#### 提取属性值的of函数

我们获取了device_node结构体之后们就可以获取里面的设备节点属性信息  。

##### 获取节点属性函数

```
struct property *of_find_property(const struct device_node *np,
const char name,int *lenp
```

- np： 指定要获取那个设备节点的属性信息  

- name： 属性名。  

- lenp： 获取得到的属性值的大小，这个指针作为输出参数，这个参数“带回”的值是实际获
  取得到的属性大小。  

返回值：获取得到的属性 结构体（property），失败返回NULL；

property属性结构体

```
struct property {
	char	*name;
	int	length;
	void	*value;
	struct property *next;
	...
};
```

- name： 属性名  

- length： 属性长度  

- value： 属性值  

- next： 下一个属性  

  

##### 读取整形属性函数

读取属性函数是一组函数，分别为读取 8、 16、 32、 64 位数据。  

```
//8 位整数读取函数
int of_property_read_u8_array(const struct device_node *np,
			const char *propname, u8 *out_values, size_t sz)
//16 位整数读取函数
int of_property_read_u16_array(const struct device_node *np,
			const char *propname, u16 *out_values, size_t sz)
//32 位整数读取函数
int of_property_read_u32_array(const struct device_node *np,
			const char *propname, u32 *out_values, size_t sz)
//64 位整数读取函数
int of_property_read_u64_array(const struct device_node *np,
			const char *propname, u64 *out_values, size_t sz)
```

- np： 指定要读取那个设备节点结构体，也就是说读取那个设备节点的数据。  
- propname： 指定要获取设备节点的哪个属性。  
- out_values： 这是一个输出参数，是函数的“返回值”，保存读取得到的数据。  

- sz： 这是一个输入参数，它用于设置读取的长度。  

返回值：返回值，成功返回 0，错误返回错误状态码（非零值）， -EINVAL（属性不存在）， -ENODATA
（没有要读取的数据）， -EOVERFLOW（属性值列表太小）。  

##### 读取字符串属性函数

```
int of_property_read_string(const struct device_node *np,
const char *propname,const char **out_string)
```

- np： 指定要获取那个设备节点的属性信息  
- propname： 属性名  
- out_string： 获取得到字符串指针，这是一个“输出”参数，带回一个字符串指针。也就是
  字符串属性值的首地址。  这个地址是“属性值”在内存中的真实位置，也就是说我们可以
  通过对地址操作获取整个字符串属性  

返回值：返回值，成功返回 0，错误返回错误状态码

```
int of_property_read_string_index(const struct device_node *np,
const char *propname, int index,const char **out_string)
```

相比前面的函数增加了参数 index，它用于指定读取属性值中第几个字符串， index 从零开始计数。
第一个函数只能得到属性值所在地址，也就是第一个字符串的地址，其他字符串需要我们手动修
改移动地址，非常麻烦，推荐使用第二个函数。  

....

#### 内存映射相关of函数

##### of_ioremap函数，直接转换为虚拟地址

我们获取相关寄存器地址后，需要将实际物理地址转化为虚拟地址。

内核提供了 of 函数，自动完成物理地址到虚拟地址的转换。  

```
void __iomem *of_iomap(struct device_node *np, int index)
```

- np： 指定要获取那个设备节点的属性信息。  

- index： 通常情况下 reg 属性包含多段， index 用于指定映射那一段，标号从 0 开始。  

返回值：成功，得到转换得到的地址。失败返回 NULL。  

##### 常规获取地址的 of 函数  ，获取的是实际物理地址

```
int of_address_to_resource(struct device_node *dev, int index,
struct resource *resource)
```

- np： 指定要获取那个设备节点的属性信息。  

- index： 通常情况下 reg 属性包含多段， index 用于指定映射那一段，标号从 0 开始。  
- r： 这是一个 resource 结构体，是“输出参数”用于返回得到的地址信息。  

返回值：成功返回 0，失败返回错误状态码。  

### 如何向设备树中添加自己的节点和获取信息

#### 1、向设备树里面添加设备节点

找到/home/dirivers/clone/imx_kernel_4.19.35/ebf_linux_kernel_6ull_depth1/arch/arm/boot/dts/imx6ull-mmc-npi.dts的dts文件

进入/home/dirivers/clone/imx_kernel_4.19.35/ebf_linux_kernel_6ull_depth1/arch/arm/boot/dts/ 

向dts设备树文件里面添加子节点。

```
led_test{
    #address-cells = <1>;
    #size-cells = <1>;

    rgb_led_red@0x0209C000{
        compatible = "fire,rgb_led_red";
        reg = <0x0209C000 0x00000020>;
        status = "okay";
     };
};
```

##### 使用命令只编译设备树

进入/home/dirivers/clone/imx_kernel_4.19.35/ebf_linux_kernel_6ull_depth1，在该目录下运行以下命令

```
sudo make ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- npi_v7_defconfig
sudo make ARCH=arm -j4 CROSS_COMPILE=arm-linux-gnueabihf- dtbs
```

编译成功后生成的设备树文件（.dtb）位于源码目录下的/arch/arm/boot/dts/，文件名为“imx6ull-mmc-npi.dtb”  

##### 替换开发板上面的imx6ull-mmc-npi.dtb

将重新编译的imx6ull-mmc-npi.dtb 设备树文件，替换开发板上面的/usr/lib/linux-image-4.19.35-imx6/imx6ull-mmc-npi.dtb  的设备树文件。

#### Linux系统中查看设备树

```
ls /proc/device-tree
ls /sys/firmware/devicetree/base
```

#### 获取设备树信息

使用of_find_node_by_path找到设备树节点，再去获取设备树子节点，再去获取子节点里面的寄存器信息。

在板卡上的部分 GPIO 可能会被系统占用，在使用前请根据需要修改 /boot/uEnv.txt 文件，可注释
掉某些设备树插件的加载，重启系统，释放相应的 GPIO 引脚。  

