---
title: gpio子系统
date: 2022-12-05 14:59:46
tags: Linux设备驱动
---

## gpio子系统

/home/dirivers/clone/imx_kernel_4.19.35/ebf_linux_kernel_6ull_depth1/arch/arm/boot/dts/imx6ull.dtsi文件中的 GPIO 子节点记录着 GPIO 控制器的寄存器地址  ，

#### gpio4节点

```
gpio4: gpio@20a8000 {
    compatible = "fsl,imx6ul-gpio", "fsl,imx35-gpio";
    reg = <0x20a8000 0x4000>;
    interrupts = <GIC_SPI 72 IRQ_TYPE_LEVEL_HIGH>,
    			<GIC_SPI 73 IRQ_TYPE_LEVEL_HIGH>;
    clocks = <&clks IMX6UL_CLK_GPIO4>;
    gpio-controller;
    #gpio-cells = <2>;
    interrupt-controller;
    #interrupt-cells = <2>;
    gpio-ranges = <&iomuxc 0 94 17>, <&iomuxc 17 117 12>;
};
```

- compatible：与GPIO子系统的平台驱动做匹配
- reg：GPIO 寄存器的基地址， GPIO4 的寄存器组是的映射地址为 0x20a8000-0x20ABFFF  
- interrupts：描述中断相关的信息  
- clocks：初始化 GPIO 外设时钟信息  
- gpio-controller：表示 gpio4 是一个 GPIO 控制器  
- #gpio-cells：表示有多少个 cells 来描述 GPIO 引脚  
- interrupt-controller：表示 gpio4 也是个中断控制器  
- #interrupt-cells：表示用多少个 cells 来描述一个中断  
- gpio-ranges：将 gpio 编号转换成 pin 引脚， <&iomuxc 0 94 17>，表示将 gpio4 的第 0 个引
  脚引脚映射为 97， 17 表示的是引脚的个数。  

gpio4这个节点对整个gpio4进行了描述，使用gpio子系统时需要往设备树添加节点，在驱动程序中使用gpio子系统提供的API实现控制gpio的效果。

#### 在设备树中添加RGB灯的设备树节点

在/imx6ull-mmc-npi.dtb  的根节点下面添加RGB节点

```
rgb_led{
    #address-cells = <1>;
    #size-cells = <1>;
    pinctrl-names = "default";
    compatible = "fire,rgb-led";
    pinctrl-0 = <&pinctrl_rgb_led>; //指定rgb灯的引脚pinctrl信息。
    rgb_led_red = <&gpio1 4 GPIO_ACTIVE_LOW>;//指定引脚使用的哪个 GPIO
    rgb_led_green = <&gpio4 20 GPIO_ACTIVE_LOW>;
    rgb_led_blue = <&gpio4 19 GPIO_ACTIVE_LOW>;
    status = "okay";
 };
```

```
rgb_led_red = <&gpio1 4 GPIO_ACTIVE_LOW>;
```

- rgb_led_red：设置引脚名字，在使用gpio子系统提供的API操作GPIO时会用到。

  const char *propname 参数用到rgb_led_red,在获取gpio编号时使用。

- &gpio1：指定gpio组

- 4：指定gpio编号

- GPIO_ACTIVE_LOW：指定有效电平

向设备树中添加节点后重新编译设备树。

### gpio子系统常用API函数详解

##### of_get_named_gpio：获取gpio编号函数

GPIO 编号可以通过 of_get_named_gpio 函数从设备树中获取。  

```
static inline int of_get_named_gpio(struct device_node *np, const char *propname,
int index)
```

- np：指定设备节点
- propname：GPIO 属性名，与设备树中定义的属性名对应。  
- index：引脚索引值，在设备树中一条引脚属性可以包含多个引脚，该参数用于指定获取那个引脚。  

成功返回gpio编号，失败返回负数；

##### gpio_request ：gpio申请函数

一个 GPIO 只能被申请一次，当不再使用某一个引脚时记得将其释放掉。

```
static inline int gpio_request(unsigned gpio, const char *label);
```

- gpio: 要申请的 GPIO 编号，该值是函数 of_get_named_gpio 的返回值。  
- label: 引脚名字，相当于为申请得到的引脚取了个别名。  

成功返回0，失败返回负数；

##### gpio_free：gpio释放函数

```
static inline void gpio_free(unsigned gpio);
```

- gpio：要释放的 GPIO 编号。  

##### gpio_direction_output：gpio输出设置函数

用于将引脚设置为输出模式  

```
static inline int gpio_direction_output(unsigned gpio , int value);
```

- gpio：设置的 GPIO 的编号。  
- value：输出值， 1，表示高电平。 0 表示低电平。  

成功返回0，失败返回负数；

##### gpio_direction_input：gpio输入设置函数

用于将引脚设置为输入模式。  

```
static inline int gpio_direction_input(unsigned gpio)
```

- gpio：要设置的 GPIO 的编号。  

成功返回0，失败返回负数；

##### gpio_get_value：获取gpio引脚值函数

用于获取引脚的当前状态。无论引脚被设置为输出或者输入都可以用该函数获取引脚的当前状态。

```
static inline int gpio_get_value(unsigned gpio);
```

- gpio：要设置的 GPIO 的编号。  

成功返回0，失败返回负数；

##### gpio_set_value：设置gpio输出值

该函数只用于那些设置为输出模式的 GPIO.  

```
static inline int gpio_direction_output(unsigned gpio, int value);
```

- gpio：设置的 GPIO 的编号。  
- value：输出值， 1，表示高电平。 0 表示低电平。  

成功返回0，失败返回负数；