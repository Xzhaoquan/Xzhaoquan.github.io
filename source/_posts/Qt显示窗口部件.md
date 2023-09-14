---
title: Qt显示窗口部件
date: 2023-09-14 13:30:35
tags: Qt
---

## Qt窗口显示部件

### QLabel

QLabel 提供了一种用于文本或图像显示的小部件  

##### 代码示例如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);

    /*使用资源里的文件格式使: + 前缀 + 文件路径*/
    QPixmap pixmap(":image/idesign-logo.png");
    LabelImage = new QLabel(this);

    /*标签大小设置为图像大小*/
    LabelImage->setGeometry(180,150,72,72);
    /*设置图像*/
    LabelImage->setPixmap(pixmap);
    /*开启允许缩放填充*/
    LabelImage->setScaledContents(true);

    LabelString = new QLabel(this);
    LabelString->setText("标签演示文本");
    LabelString->setGeometry(300,300,120,20);
}
```

### QCalendarWidget

QCalendarWidget 类提供了一个基于月的日历小部件，允许用户选择日期。  

##### 代码示例如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    CalendarWidget = new QCalendarWidget(this);
    CalendarWidget->setGeometry(200,20,400,300);

    QFont font;
    /*设置日历里字体的大小为10像素*/
    font.setPixelSize(10);
    CalendarWidget->setFont(font);

    PushButton = new QPushButton(this);
    PushButton->setGeometry(200,350,120,30);
    PushButton->setText("回到当前日期");

    Label = new QLabel(this);
    Label->setGeometry(400,350,400,30);
    QString str = "当前选择的日期:" + CalendarWidget->selectedDate().toString();
    Label->setText(str);

    connect(CalendarWidget,SIGNAL(selectionChanged()),this,SLOT(calendarWidgetSelectChanged()));
    connect(PushButton,SIGNAL(clicked()),this,SLOT(pushButtonClicked()));
}

void MainWindow::calendarWidgetSelectChanged(){
    QString str = "当前选择的日期:" + CalendarWidget->selectedDate().toString();
    Label->setText(str);
}
void MainWindow::pushButtonClicked(){
    /*设置当前选定的日期为系统的QDate*/
    CalendarWidget->setSelectedDate(QDate::currentDate());
}
```

### QLCDNumber

QLCDNumber 小部件显示一个类似于 lcd 的数字。QLCDNumber 小部件可以显示任意大小的数字。它可以显示十进制、十六进制、八进制或二进制数字。使用 display()插槽很容易连接到数据源，该插槽被重载以接受五种参数类型中的任何一种。  

##### 代码示例如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    lcdNumber = new QLCDNumber(this);
    lcdNumber->setGeometry(300,200,200,50);
    /*设置显示的位数为8位*/
    lcdNumber->setDigitCount(8);
    /*设置样式*/
    lcdNumber->setSegmentStyle(QLCDNumber::Flat);
    /*设置LCD显示为当前系统时间*/
    QTime time = QTime::currentTime();
    lcdNumber->display(time.toString("hh:mm:ss"));
    timer = new QTimer(this);
    /*设置定时器1000毫秒发送一个timeout信号*/
    timer->start(1000);
    connect(timer,SIGNAL(timeout()),this,SLOT(TimerTimeOut()));
}

void MainWindow::TimerTimeOut(){
    QTime time = QTime::currentTime();
    lcdNumber->display(time.toString("hh:mm:ss"));
}
```

### QProgressBar

QProgressBar 继承 QWidget。 QProgressBar 小部件提供了一个水平或垂直的进度条。进度条用于向用户显示操作的进度，并向他们确认应用程序仍在运行。  QProgressBar 一般用于表示进度，常用于如复制进度，
打开、加载进度等。  

##### 示例代码如下

```
#include "mainwindow.h"
/*实现手机电池充电进度条*/
MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    progressBar = new QProgressBar(this);
    progressBar->setGeometry(300,200,200,60);
    /*样式表设置，常用setStyleSheet来设置样式(实现界面美化的功能)*/
    progressBar->setStyleSheet("QProgressBar{border:8px solid #FFFFFF;"
                               "height:30;"
                               "border-image:url(:/images/battery.png);"//背景图片
                               "text-align:center;"//文字居中
                               "color:rgb(255,0,255);"
                               "font:20px;"//字体为20px
                               "border-radius:10px;}"
                               "QProgressBar::chunk{" //斑马线圆角
                               "border-radius:5px;"
                               "border:1px solid black;"//黑边
                               "background-color:skyblue;"
                               "width:10px;"//宽度
                               "margin:1px;}");//间距
    /*设置progressBar的范围值*/
    progressBar->setRange(0,100);
    /*初始化value = 0*/
    value = 0;
    /*设置progressBar的当前值*/
    progressBar->setValue(value);
    /*设置当前文本字符串的显示格式*/
    progressBar->setFormat("充电中%p%");
    /*定时器设置100毫秒发送一个timeout信号*/
    timer = new QTimer(this);
    timer->start(100);
    connect(timer,SIGNAL(timeout()),this,SLOT(timerTimerOut()));
}

void MainWindow::timerTimerOut(){
    /*定时器超时，value++*/
    value ++;
    progressBar->setValue(value);
    if(value > 100){
        value = 0;
    }
}
```

### QFrame

QFrame主要用于画窗口部件，和画边框

定义效果

- NoFrame - QFrame 不画任何东西
- Box - QFrame 在它的内容周围画一个框
- Panel - QFrame 画一个平板使内容看起来凸起或者凹陷
- WinPanel - 像 Panel，但 QFrame 绘制三维效果的方式和 Microsoft Windows 95（及其它）的一样
- ToolBarPanel - QFrame 调用 QStyle::drawToolBarPanel()
- MenuBarPanel - QFrame 调用 QStyle::drawMenuBarPanel()
- HLine - QFrame 绘制一个水平线，但没有框任何东西（作为分隔是有用的）
- VLine - QFrame 绘制一个竖直线，但没有框任何东西（作为分隔是有用的）
- StyledPanel - QFrame 调用 QStyle::drawPanel()
- PopupPanel - QFrame 调用 QStyle::drawPopupPanel()

阴影风格有

- Plain 使用调色板的前景颜色绘制（没有任何三维效果）。
- Raised 使用当前颜色组的亮和暗颜色绘制三维的凸起线。
- Sunken 使用当前颜色组的亮和暗颜色绘制三维的凹陷线。  

##### 示例代码如下

```
#include "mainwindow.h"
/*实现画两个矩形框*/
MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);

    hFrame = new QFrame(this);
    /*设置起始点，设置长和宽，绘制矩形*/
    hFrame->setGeometry(QRect(200,100,400,40));
    /*设置框样式为Hline，水平，可设置其他样式如Box*/
    hFrame->setFrameShape(QFrame::Box);
    /*绘制阴影*/
    hFrame->setFrameShadow(QFrame::Sunken);

    vFrame = new QFrame(this);
    /*设置起始点，设置长和宽，绘制矩形*/
    vFrame->setGeometry(QRect(300,100,20,200));
    /*设置框样式为Hline，水平，可设置其他样式如Box*/
    vFrame->setFrameShape(QFrame::Box);
    /*绘制阴影*/
    vFrame->setFrameShadow(QFrame::Sunken);
}
```