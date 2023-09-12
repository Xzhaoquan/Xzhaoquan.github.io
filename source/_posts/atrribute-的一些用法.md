---
title: __atrribute__的一些用法
date: 2023-01-27 20:00:31
tags: C语言
---

# __attribute__用法

### attribute属性声明：format

GNU 通过 __atttribute__ 扩展的 format 属性，用来***指定变参函数的参数格式检查***。

```
__attribute__(( format (archetype, string-index, first-to-check)))
```

- archetype：指定格式类型
- string-index：格式字符串的位置在所有参数列表中的索引
- first-to-check：编译器帮忙检查的参数，在所有的参数列表里索引的位置

使用示例：

```
void LOG(const char *fmt, ...)  __attribute__((format(printf,1,2)));
```

- 第一个参数 printf 是告诉编译器，按照 printf 函数的检查标准来检查；

- 第2个参数表示在 LOG 函数所有的参数列表中，格式字符串的位置索引；
- 第3个参数是告诉编译器要检查的参数的起始位置。

```
void LOG(int num, char *fmt, ...)  __attribute__((format(printf,2,3)));
```

在这个函数定义中，多了一个参数 num，格式字符串在参数列表中的位置发生了变化（在所有的参数列表中，索引为2），要检查的第一个变参的位置也发生了变化（索引为3），那我们使用 format 属性声明时，就要写成 format(printf,2,3) 的形式了。

```
void __attribute__ ((format(printf,1,2))) ESP_LOGI(char *fmt,...) 
{
	va_list arg;
    va_start(arg, fmt);
    vprintf(fmt, arg);
    va_end(arg);
}
```

