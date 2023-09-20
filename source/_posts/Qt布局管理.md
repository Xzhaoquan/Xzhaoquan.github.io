---
title: Qt布局管理
date: 2023-09-20 09:39:49
tags: Qt
---

## Qt布局管理

### QBoxLayout

QBoxLayout 继承 QLayout。 QBoxLayout 类提供水平或垂直地排列子部件。 QBoxLayout 获取从它的父布局或从 parentWidget()中所获得的空间，将其分成一列框，并使每个托管小部件填充一个框。  

##### 代码示例

```
#include "mainwindow.h"
#include <QList>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    hWidget = new QWidget(this);
    hWidget->setGeometry(0,0,800,240);

    vWidget = new QWidget(this);
    vWidget->setGeometry(0,240,200,240);

    hBoxLayout = new QHBoxLayout(this);
    vBoxLayout = new QVBoxLayout(this);

    /*使用QList链表*/
    QList <QString> list;
    list<<"one"<<"two"<<"three"<<"four"<<"five"<<"six";
    /*实例化PushButton*/
    for(int i = 0;i < 6;i ++){
        button[i] = new QPushButton(this);
        button[i]->setText(list[i]);
        if(3 > i){
            /*将按钮添加到hBoxLayout*/
            hBoxLayout->addWidget(button[i]);
        }else{
            vBoxLayout->addWidget(button[i]);
        }
    }
    /*设置按钮间隔为50*/
    hBoxLayout->setSpacing(50);
    hWidget->setLayout(hBoxLayout);
    vWidget->setLayout(vBoxLayout);
}
```

### QGridLayout

QGridLayout 类提供了布局管理器里的一种以网格（二维）的方式管理界面组件  

QGridLayout获取可用的空间(通过其父布局或parentWidget()))，将其分为行和列，并将其管理的每个小部件放入正确的单元格中。由于网格布局管理器中的组件也是会随着窗口拉伸而发生变化的，所以也是需要设置组件之间的比例系数的，与QBoxLayout 不同的是网格布局管理器还需要分别设置行和列的比例系数。  

##### 示例代码

```
#include "mainwindow.h"
#include <QList>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);

    gWidget = new QWidget(this);
    /*设置gWidget居中央*/
    this->setCentralWidget(gWidget);
    gridLayout = new QGridLayout();

    QList <QString> list;
    list<<"button1"<<"button2"<<"button3"<<"button4"<<"button5"<<"button6";

    for(int i = 0;i < 4;i ++){
        button[i] = new QPushButton(this);
        button[i]->setText(list[i]);
        /*设置按钮的最小宽度与高度*/
        button[i]->setMaximumSize(100,30);
        /*设置自动调整按钮大小*/
        button[i]->setSizePolicy(
                    QSizePolicy::Expanding,
                    QSizePolicy::Expanding
                    );
        switch(i){
        case 0:
            /*将button添加到网格的坐标(0,0)*/
            gridLayout->addWidget(button[i],0,0);
            break;
        case 1:
            gridLayout->addWidget(button[i],0,1);
            break;
        case 2:
            gridLayout->addWidget(button[i],1,0);
            break;
        case 3:
            gridLayout->addWidget(button[i],1,1);
            break;
        default:
            break;
        }
    }
    /*设置0,1行的行比例系数*/
    gridLayout->setRowStretch(0,2);
    gridLayout->setRowStretch(1,3);
    /*设置0,1列的列比例系数*/
    gridLayout->setColumnStretch(0,1);
    gridLayout->setColumnStretch(1,3);

    gWidget->setLayout(gridLayout);
}
```

### QFormLayout

QFormLayout 继承 QLayout。 QFormLayout 类管理输入小部件及其关联标签的表单。 QFormLayout 是一个方便的布局类，它以两列的形式布局其子类。左列由标签组成，右列由“字段”小部件(QLineEdit(行编辑器)、 QSpinBox(旋转框等))组成。通常使用 setRowWrapPolicy(RowWrapPolicy policy)接口函数设置布局的换行策略进行布局等。   

##### 代码示例

```
#include "mainwindow.h"
#include <QList>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);

    gWidget = new QWidget(this);
    /*设置gWidget居中央*/
    this->setCentralWidget(gWidget);
    gridLayout = new QGridLayout();

    QList <QString> list;
    list<<"button1"<<"button2"<<"button3"<<"button4"<<"button5"<<"button6";

    for(int i = 0;i < 4;i ++){
        button[i] = new QPushButton(this);
        button[i]->setText(list[i]);
        /*设置按钮的最小宽度与高度*/
        button[i]->setMaximumSize(100,30);
        /*设置自动调整按钮大小*/
        button[i]->setSizePolicy(
                    QSizePolicy::Expanding,
                    QSizePolicy::Expanding
                    );
        switch(i){
        case 0:
            /*将button添加到网格的坐标(0,0)*/
            gridLayout->addWidget(button[i],0,0);
            break;
        case 1:
            gridLayout->addWidget(button[i],0,1);
            break;
        case 2:
            gridLayout->addWidget(button[i],1,0);
            break;
        case 3:
            gridLayout->addWidget(button[i],1,1);
            break;
        default:
            break;
        }
    }
    /*设置0,1行的行比例系数*/
    gridLayout->setRowStretch(0,2);
    gridLayout->setRowStretch(1,3);
    /*设置0,1列的列比例系数*/
    gridLayout->setColumnStretch(0,1);
    gridLayout->setColumnStretch(1,3);

    gWidget->setLayout(gridLayout);
}
```

### QSpacerItem

QSpacerItem 类在布局中提供空白(空间间隔)。所以 QSpacerItem 是在布局中使用的。  

##### 代码示例

```
#include "mainwindow.h"
#include <QList>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    widget = new QWidget(this);
    /*设置widget居中*/
    this->setCentralWidget(widget);
    /*实例化QSpacerItem*/
    vSpacer = new QSpacerItem(10,10,QSizePolicy::Minimum,QSizePolicy::Expanding);
    hSpacer = new QSpacerItem(10,10,QSizePolicy::Expanding,QSizePolicy::Minimum);

    mainLayout = new QHBoxLayout();
    hBoxLayout = new QHBoxLayout();
    vBoxLayout = new QVBoxLayout();

    /*在VboxLayout添加垂直间隔*/
    vBoxLayout->addSpacerItem(vSpacer);

    QList <QString> list;
    list<<"bt1"<<"bt2"<<"bt3"<<"bt4"<<"bt5"<<"bt6";

    for(int i = 0;i < 6;i ++){
        button[i] = new QPushButton(this);
        button[i]->setText(list[i]);
        if(3 > i){
            /*按钮1设置大小为100 * 100*/
            button[i]->setFixedSize(60,30);
            /*在vboxLayout添加按钮*/
            vBoxLayout->addWidget(button[i]);
        }else{
            button[i]->setFixedSize(60,30);
            hBoxLayout->addWidget(button[i]);
        }
    }
    /*在hBoxLayout里面添加水平间隔*/
    hBoxLayout->addSpacerItem(hSpacer);
    /*在主布局俩面添加垂直布局*/
    mainLayout->addLayout(vBoxLayout);
    /*在主布局里面添加水平布局*/
    mainLayout->addLayout(hBoxLayout);
    /*设置部件之间的间距*/
    mainLayout->setSpacing(30);
    widget->setLayout(mainLayout);
}
```