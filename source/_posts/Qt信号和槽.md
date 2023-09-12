---
title: Qt信号和槽
date: 2023-09-12 17:27:00
tags: Qt
---

## Qt信号与槽

#### QT信号与槽机制

信号（signal）：在特定情况下被发送的事件

槽（slot）：对信号响应的函数，槽函数可以与一个信号关联，当信号被发送时，槽函数自动执行。



信号与槽关联使用QObject::connect()函数实现：

```
example：
QObject::connect(sender,SIGNAL(signal()),receiver,SLOT(slot()));
connect(sender,SIGNAL(signal()),receiver,SLOT(slot()));
上面两种写法都可以，因为QObject是QT的基类，在调用是可以忽略前面的限定符。
sender:发送信号的对象
receiver:接受信号的对象
SIGNAL和SLOT是QT的宏，用于指明信号和槽，并将参数转化成相应字符串。
signal:需要发送的信号
slot:接收信号的槽
```

##### 信号的创建

- 在mainwindow.h里面引入 <QPushButton>

```
#include <QPushButton>
```

- 声明一个信号

```
signals:
    void pushButtonTextChanged();
```

##### 槽的创建

- 直接在mainwindow.h里面声明槽。

```
public slots:
    void changeButtonText();
    void pushButtonClicked();
```

- 并且在mainwindow.cpp里面实现槽的定义。

```
void MainWindow::pushButtonClicked(){
    /*use emit send signal*/
    emit pushButtonTextChanged();
}

void MainWindow::changeButtonText(){
    pushButton->setText("按钮被按下");
}
```

- 槽可以是任何成员函数，不同全局函数，静态函数。
- 槽函数和信号的参数和返回值要一样。

##### 信号和槽的连接

```
connect(pushButton,SIGNAL(clicked()),this,SLOT(pushButtonClicked()));
connect(this,SIGNAL(pushButtonTextChanged()),this,SLOT(changeButtonText()));
```



##### mainwindow如下：

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    /*set windows width hight 480 * 800*/
    this->resize(800,480);
    /*create QPushBotton Class*/
    pushButton = new QPushButton(this);
    /*use setText() set text infomation*/
    pushButton->setText("按钮");

    /*signal slot connect signal*/
    connect(pushButton,SIGNAL(clicked()),this,SLOT(pushButtonClicked()));
    connect(this,SIGNAL(pushButtonTextChanged()),this,SLOT(changeButtonText()));
}

MainWindow::~MainWindow()
{
}

void MainWindow::pushButtonClicked(){
    /*use emit send signal*/
    emit pushButtonTextChanged();
}

void MainWindow::changeButtonText(){
    pushButton->setText("按钮被按下");
}
```

