---
title: pinctrl子系统
date: 2022-12-05 14:09:03
tags: Linux设备驱动
---

## pinctrl子系统

### pinctrl子系统简介

pinctrl 子系统主要用于管理芯片的引脚  

### pinctrl子系统编写格式

#### iomuxc节点介绍

##### 去找到imx6ull.dtsi里面的iomuxc节点

```
/home/dirivers/clone/imx_kernel_4.19.35/ebf_linux_kernel_6ull_depth1/arch/arm/boot/dts/imx6ull.dtsi
```

```
iomuxc: iomuxc@20e0000 {
    compatible = "fsl,imx6ul-iomuxc";
    reg = <0x20e0000 0x4000>;
};
```

- compatible：与平台驱动做匹配的名字，这里是与pinctrl平台做匹配的名字
- reg：表示的是引脚配置寄存器的基地址  

##### 在imx6ull-mmc-npi.dts里面使用&iomuxc向iomuxc节点追加内容。

```
&iomuxc {
	pinctrl-names = "default";
	pinctrl-0 = <&pinctrl_hog_1>;

	pinctrl_hog_1: hoggrp-1 {
		fsl,pins = <
			MX6UL_PAD_UART1_RTS_B__GPIO1_IO19	0x17059 /* SD1 CD */
			MX6UL_PAD_GPIO1_IO05__USDHC1_VSELECT	0x17059 /* SD1 VSELECT */
			MX6UL_PAD_GPIO1_IO09__GPIO1_IO09        0x17059 /* SD1 RESET */
		>;
	};
	...
}
```

- pinctrl-names：指定pin的状态列表，默认设置为"default"
- pinctrl-0 = <&pinctrl_hog_1>：表示在默认设置下，将使用pinctrl_hog_1这个节点来设置GPIO端口状态
- 其余都是pinctrl子节点，按照规范格式编写

##### pinctrl向iomuxc举例说明

```
&iomuxc {
  pinctrl-names = "default","sleep","init";
  pinctrl-0 = <&pinctrl_uart1>;
  pinctrl-1 =<&xxx>;
  pinctrl-2 =<&yyy>;
  ...
  pinctrl_uart1: uart1grp {
    fsl,pins = <
      MX6UL_PAD_UART1_TX_DATA__UART1_DCE_TX 0x1b0b1
      MX6UL_PAD_UART1_RX_DATA__UART1_DCE_RX 0x1b0b1
    >;
   };

   xxx: xxx_grp {
      ... 这里设置将引脚设置为其他模式
   }

   yyy: yyy_grp {
      ... 这里设置将引脚设置为其他模式
   }

   ...
}
```

- pinctrl-names： 定义引脚状态。  
- pinctrl-0： 定义第 0 种状态需要使用到的引脚配置，可引用其他节点标识。  
- pinctrl-1： 定义第 1 种状态需要使用到的引脚配置。  
- pinctrl-2： 定义第 2 种状态需要使用到的引脚配置  

##### pinctrl子节点格式规范，格式框架

```
pinctrl_自定义名字：自定义名字{
	fsl,pins = <
		引脚复用宏定义 	PAD（引脚属性）
		引脚复用宏定义 	PAD（引脚属性）
	>;
};
```

引脚复用宏定义在/home/dirivers/clone/imx_kernel_4.19.35/ebf_linux_kernel_6ull_depth1/arch/arm/boot/dts/imx6ul-pinfunc.hl里面去寻找

```
宏定义格式：
#define MX6UL_xxx 	mux_reg conf_reg input_reg mux_mode input_val

mux_reg conf_reg input_reg mux_mode input_val
0x0084 0x0310 0x0000 0x0 0x0
```

- mux_reg：引 脚 复 用 选 择 寄 存 器 偏 移 地 址  (在寄存器基地址上面偏移（0x0084）)
- conf_reg：引脚（PAD）属性控制寄存器偏移地址  （基本参考官方给出的配置）
- input_reg：输入选择寄存器便宜地址
- mux_mode：选择需要配置的复用模式0
- input_val：输入选择寄存器的值  

```
#define MX6UL_PAD_BOOT_MODE0__GPIO5_IO10		0x0014 0x02a0 0x0000 5 0
#define MX6UL_PAD_BOOT_MODE1__GPIO5_IO11		0x0018 0x02a4 0x0000 5 0
```

### 如何新增pinctrl节点

在imx6ull-mmc-npi.dts新增pinctrl节点

```
&iomuxc {
	pinctrl-names = "default";
	pinctrl-0 = <&pinctrl_hog_1>;
	/*新增加的pinctrl节点*/
	pinctrl_rgb_led:rgb_led{
		fsl,pins = <
			MX6UL_PAD_GPIO1_IO04__GPIO1_IO04 0x000010B1
			MX6UL_PAD_CSI_HSYNC__GPIO4_IO20 0x000010B1
			MX6UL_PAD_CSI_VSYNC__GPIO4_IO19 0x000010B1
		>;
	};
	...
}
```

