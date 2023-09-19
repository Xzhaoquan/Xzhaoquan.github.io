---
title: Qt显示窗口部件之浏览器
date: 2023-09-14 16:03:01
tags: Qt
---

## Qt显示窗口部件

### QTextBrowser

QTextBrowser 继承 QTextEdit， QTextBrowser 类提供了一个具有超文本导航的文本浏览器。该类扩展了 QTextEdit(在只读模式下)，添加了一些导航功能，以便用户可以跟踪超文本文档中的链接。  

#### QTextBrowser使用示例

- 新建一个带ui的工程
- 声明和实例化QTextBrowser
- 信号和槽的连接
- 槽函数的实现

##### 示例代码如下

```
#include "mainwindow.h"
#include "ui_mainwindow.h"
/*窗口对话框与文本流*/
#include <QFileDialog>
#include <QTextStream>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindow)
{
    ui->setupUi(this);
    this->setGeometry(0,0,800,480);
    /*将窗口标题设置为文本浏览器*/
    this->setWindowTitle("文本浏览器");
    /*实例化*/
    textBroser = new QTextBrowser(this);
    /*设置文本浏览器窗口居中*/
    this->setCentralWidget(textBroser);

    openAction = new QAction("打开",this);
    /* ui 窗口自带有 menubar(菜单栏)、 mainToolbar（工具栏）与
    * statusbar（状态栏）
    * menuBar 是 ui 生成工程就有的，所以可以在 menubar 里添加
    * 我们的 QActiont 等，如果不需要 menubar，可以在 ui 设计
    * 窗口里，在右则对象里把 menubar 删除，再自己重新定义自己的
    * 菜单栏
    */
    ui->menubar->addAction(openAction);
    connect(openAction,SIGNAL(triggered()),this,SLOT(openActionTriggered()));
}

void MainWindow::openActionTriggered(){
    /*调用系统打开文件窗口，过滤文件名*/
    QString FileName = QFileDialog::getOpenFileName(this,tr("打开文件"),"",
                                                  tr("Files(*.txt *.cpp *.h *.html)"));
    QFile myFile(FileName);
    /*以只读文本方式打开*/
    if(!myFile.open(QIODevice::ReadOnly | QIODevice::Text)){
        return;
    }
    /*使用QTextStream对象接收*/
    QTextStream in (&myFile);
    /*读取全部数据*/
    QString myText = in.readAll();

    /*判断打开文件的后缀，如果使html格式的则设置文本浏览器为html格式*/
    if(FileName.endsWith("html") || FileName.endsWith("htm")){
        textBroser->setHtml(myText);
    }else{
        textBroser->setPlainText(myText);
    }
    /*Ui 窗口自带有statusbar(状态栏),设置打开的文件名*/
    ui->statusbar->showMessage("文件名:" + FileName);
}
```