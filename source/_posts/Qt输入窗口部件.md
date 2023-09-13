---
title: Qt输入窗口部件
date: 2023-09-12 17:26:46
tags: Qt
---

## Qt窗口输入部件

### 1、QComboBox

QComboBox提供下拉组合框的组件。

### QComboBox使用示例

- 声明<QComboBox>

```
private:
    QComboBox *ComboBox;
```

- 实例化 QComboBox组件，和初始化QComboBox组件

```
    ComboBox = new QComboBox(this);
    ComboBox->setGeometry(300,200,150,30);
    ComboBox->addItem("四川(default)");
    ComboBox->addItem("云南");
    ComboBox->addItem("贵州");
```

- 实现信号和槽的连接

```
connect(ComboBox,SIGNAL(currentIndexChanged(int)),this,SLOT(ComboBoxIndexChanged(int)));
```

- 实现QComboBox的槽函数

```
void MainWindow::ComboBoxIndexChanged(int index){
    qDebug()<<"您选择的省份是"<<ComboBox->itemText(index)<<endl;
}
```



##### 示例代码如下

```
#include "mainwindow.h"
#include <QDebug>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    ComboBox = new QComboBox(this);
    ComboBox->setGeometry(300,200,150,30);
    ComboBox->addItem("四川(default)");
    ComboBox->addItem("云南");
    ComboBox->addItem("贵州");
    connect(ComboBox,SIGNAL(currentIndexChanged(int)),this,SLOT(ComboBoxIndexChanged(int)));

}

void MainWindow::ComboBoxIndexChanged(int index){
    qDebug()<<"您选择的省份是"<<ComboBox->itemText(index)<<endl;
}
```

### 2、QFontComboBox

QFontComboBox 类提供了下拉选择字体系列的组合框小部件。  

### QFontComboBox使用示例

- 引入<QFontComboBox>

- 声明QFontComboBox对象

```
private:
    QFontComboBox *FontConboBox;
```

- 实例化对象QFontComboBox

```
FontConboBox = new QFontComboBox(this);
    Label = new QLabel(this);

    FontConboBox->setGeometry(280,200,200,30);
    Label->setGeometry(280,250,300,50);
```

- 实现槽函数

```
/*将lable里面的文本内容设置为所选择的字体*/
    Label->setFont(Font);
    /*定义一个字符串接收当前项的字体*/
    QString str = "用此标签显示字体效果\n设置的字体为:" +
            FontConboBox->itemText(FontConboBox->currentIndex());
    /*将字符串的内容作为lable的显示内容*/
    Label->setText(str);
```

- 连接信号和槽

```
connect(FontConboBox,SIGNAL(currentFontChanged(QFont)),this,SLOT(FontComboBoxFontChanged(QFont)));
```

##### 代码示例如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);

    FontConboBox = new QFontComboBox(this);
    Label = new QLabel(this);

    FontConboBox->setGeometry(280,200,200,30);
    Label->setGeometry(280,250,300,50);

    connect(FontConboBox,SIGNAL(currentFontChanged(QFont)),this,SLOT(FontComboBoxFontChanged(QFont)));

}

void MainWindow::FontComboBoxFontChanged(QFont Font){
    /*将lable里面的文本内容设置为所选择的字体*/
    Label->setFont(Font);
    /*定义一个字符串接收当前项的字体*/
    QString str = "用此标签显示字体效果\n设置的字体为:" +
            FontConboBox->itemText(FontConboBox->currentIndex());
    /*将字符串的内容作为lable的显示内容*/
    Label->setText(str);
}
```

### 3、QLineEdit

QLineEdit 小部件是一个单行文本编辑器。  

#### QLineEdit的使用示例

- 引入<QLineEdit>
- 声明和实例化QLineEdit
- 实现和连接槽函数

##### 示例代码如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);

    LineEdit = new QLineEdit(this);
    LineEdit->setGeometry(280,200,200,20);
    PushButton = new QPushButton(this);
    PushButton->setGeometry(500,200,50,20);
    PushButton->setText("确认");
    Label = new QLabel(this);
    Label->setGeometry(280,250,400,20);
    Label->setText("您输入的内容是:");

    connect(PushButton,SIGNAL(clicked()),this,SLOT(PushButtonClicked()));
}

void MainWindow::PushButtonClicked(){
    QString str;

    str = "您输入的内容是: ";
    str += LineEdit->text();
    /*设置label文本显示内容*/
    Label->setText(str);
    /*点击确认键之后清空LineEdit单行输入框*/
    LineEdit->clear();
}
```

### 4、QTextEdit

QTextEdit 类提供了一个查看器/编辑器小部件。  

#### QTextEdit的使用示例

- 引入<QTextEdit>
- 声明和实例化QTextEdit
- 实现槽函数和信号和槽的连接

##### 代码示例如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    textEdit = new QTextEdit(this);
    textEdit->setGeometry(0,0,800,400);

    pushButtonSelect = new QPushButton(this);
    pushButtonSelect->setGeometry(200,420,50,30);
    pushButtonSelect->setText("全选");

    pushButtonClear = new QPushButton(this);
    pushButtonClear->setGeometry(500,420,50,30);
    pushButtonClear->setText("清除");

    connect(pushButtonSelect,SIGNAL(clicked()),this,SLOT(pushButtonSelectAllClicked()));
    connect(pushButtonClear,SIGNAL(clicked()),this,SLOT(pushButtonClearAllClicked()));

}

void MainWindow::pushButtonSelectAllClicked(){
    /*设置焦点为textEdit*/
    textEdit->setFocus();
    /*判断文本编辑内容是否为空，不为空则全选*/
    if(!textEdit->toPlainText().isEmpty()){
        textEdit->selectAll();
    }
}

void MainWindow::pushButtonClearAllClicked(){
    /*清空textEdit里面的内容*/
    textEdit->clear();
}
```

### 5、QPlainTextEdit

QPlainTextEdit 类提供了一个用于编辑和显示纯文本的小部件，常用于显示多行文本或简单
文本。  

##### 示例代码如下

```
#include "mainwindow.h"
#include <QDir>
#include <QTextStream>
#include <QCoreApplication>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    /*设置当前程序的工作目录为可执行程序的工作目录*/
    QDir::setCurrent(QCoreApplication::applicationDirPath());

    this->setGeometry(0,0,800,480);
    plainTextEdit = new QPlainTextEdit(this);
    plainTextEdit->setGeometry(0,50,800,430);

    radioButton = new QRadioButton(this);
    radioButton->setGeometry(650,20,100,20);
    radioButton->setText("只读模式");

    /*打开可执行程序目录里面的moc_mainwindow.cpp.cpp*/
    QFile file("moc_mainwindow.cpp");
    /*以只读模式打开，但是可以在plainTextEdit里面编辑*/
    file.open(QFile::ReadOnly | QFile::Text);
    /*加载到文件流*/
    QTextStream in(&file);
    /*从文件流中读取全部*/
    plainTextEdit->insertPlainText(in.readAll());
    connect(radioButton,SIGNAL(clicked()),this,SLOT(radioButtonClicked()));
}

void MainWindow::radioButtonClicked(){
    if(radioButton->isChecked()){
        /*设置为只读模式*/
        plainTextEdit->setReadOnly(true);
    }else{
        plainTextEdit->setReadOnly(false);
    }
}
```

### 6、QSpinBox

QSpinBox 类提供了一个微调框小部件  

##### 示例代码如下

```
#include "mainwindow.h"
#include <QDebug>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    this->setStyleSheet("QMainWindow {background-color: rgba(100,100,100,100%)}");

    SpinBox = new QSpinBox(this);
    SpinBox->setGeometry(350,200,150,30);

    /*设置范围0~100*/
    SpinBox->setRange(0,100);
    /*设置步长值为10*/
    SpinBox->setSingleStep(10);
    /*设置初始值为100*/
    SpinBox->setValue(100);
    /*设置后缀*/
    SpinBox->setSuffix("%不透明度");
    connect(SpinBox,SIGNAL(valueChanged(int)),this,SLOT(spinBoxValueChanged(int)));

}

void MainWindow::spinBoxValueChanged(int value){
    /*转换为double 数据类型*/
    double dvalue = (double)value / 100;
    this->setWindowOpacity(dvalue);
    qDebug()<< "value is: "<<value<<endl;
}
```

### 7、QDoubleSpinBox

QDoubleSpinBox 类提供了一个用于处理浮点值微调框小部件。与 QSpinBox 作用基本一样，
与 QSpinBox 不同的是， QDoubleSpinBox 类处理的是浮点值数据。  

##### 示例代码如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    /*实例化和设置显示的位置大小*/
    DoubleSpinBox = new QDoubleSpinBox(this);
    DoubleSpinBox->setGeometry((this->width() - 200)/2,(this->height() - 30) / 2,200,30);
    /*设置前缀*/
    DoubleSpinBox->setPrefix("窗口大小");
    /*设置后缀*/
    DoubleSpinBox->setSuffix("%");
    /*设置范围*/
    DoubleSpinBox->setRange(50.00,100.00);
    /*设置初始值*/
    DoubleSpinBox->setValue(100.00);
    /*设置步长*/
    DoubleSpinBox->setSingleStep(0.1);

    connect(DoubleSpinBox,SIGNAL(valueChanged(double)),this,SLOT(DoubleSpinBoxValueChanged(double)));
}

void MainWindow::DoubleSpinBoxValueChanged(double value){
    int width = 800 * value / 100;
    int height = 480 *value / 100;

    this->setGeometry(0,0,width,height);
    DoubleSpinBox->setGeometry((this->width() - 200)/2,
                               (this->height() - 30) / 2,200,30);
}
```

### 8、QTimeEdit QTimeDateEdit QDateEdit

QTimeEdit 类提供一个基于 QDateTimeEdit 类编辑时间的小部件。  

QDateEdit 类提供一个基于 QDateTimeEdit 类编辑时间的小部件。  

QDateTimeEdit 类提供了一个用于编辑日期和时间的小部件。 QDateTimeEdit
允许用户使用键盘或箭头键编辑日期，以增加或减少日期和时间值。  

##### 代码示例如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    /*实例化对象，传入当前日期和时间*/
    dateTimeEdit = new QDateTimeEdit(QDateTime::currentDateTime(),this);
    dateTimeEdit->setGeometry(300,200,200,30);

    /*设置弹出日期控件与否*/
    dateTimeEdit->setCalendarPopup(true);
    /*实例化对象，传入当前时间*/
    timeEdit = new QTimeEdit(QTime::currentTime(),this);
    timeEdit->setGeometry(300,240,200,30);
    /*实例化对象传入当前日期*/
    dateEdit = new QDateEdit(QDate::currentDate(),this);
    dateEdit->setGeometry(300,280,200,30);
}
```

### 9、QDial

QDial 类提供了一个圆形范围控制(如速度计或电位器)。 QDial 用于当用户需要在可编程定义的范围内控制一个值，并且该范围要么是环绕的(例如，从 0 到 359 度测量的角度)，要么对话框布局需要一个正方形小部件。  当 wrapping（）为 false（默认设置）时，滑块和刻度盘之间没有真正的区别。  

##### 代码示例如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);

    dial = new QDial(this);
    dial->setGeometry(300,100,200,200);

    /*设置页长(两个最大刻度的间距)*/
    dial->setPageStep(10);
    /*设置刻度可见*/
    dial->setNotchesVisible(true);
    /*设置两个凹槽之间的目标像素数*/
    dial->setNotchTarget(1.00);
    /*设置dial值的范围*/
    dial->setRange(0,100);
//    /*开启后可以指向圆的任何角度*/
//    dial->setWrapping(true);

    label = new QLabel(this);
    label->setGeometry(370,300,200,50);
    label->setText("0km/h");

    connect(dial,SIGNAL(valueChanged(int)),this,SLOT(dialValueChanged(int)));
}

void MainWindow::dialValueChanged(int value){
    /*使用QString::number()转化成字符串*/
    label->setText(QString::number(value) + "km/h");
}
```

### 10、QScroolBar

QScrollBar 继承 QAbstractSlider。 QScrollBar 小部件提供垂直或水平滚动条，允许用户访问比用于显示文档的小部件大的文档部分。它提供了用户在文档中的当前位置和可见文档数量的可视化指示。  

##### 代码示例如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    /*实例化水平滚动条hScrollBar*/
    hScrollBar = new QScrollBar(Qt::Horizontal,this);
    hScrollBar->setGeometry(0,450,800,30);
    /*实例化竖直滚动条vScrollBar*/
    vScrollBar = new QScrollBar(Qt::Vertical,this);
    vScrollBar->setGeometry(770,0,30,480);

    label = new QLabel(this);
    label->setText("这是一个测试");
    label->setGeometry(300,200,120,30);
}
```

### 11、QSlider

QSlider 继承 QAbstractSlider。 QScrollBar 类提供垂直或水平滑动条小部件，滑动条是用于控制有界值的典型小部件。它允许用户沿着水平或垂直凹槽移动滑块手柄，并将手柄的位置转换为合法范围内的整数值。  

##### 代码示例如下

```
#include "mainwindow.h"

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);

    vSlider = new QSlider(Qt::Vertical,this);
    vSlider->setGeometry(200,50,20,200);
    vSlider->setRange(0,100);

    hSlider = new QSlider(Qt::Horizontal,this);
    hSlider->setGeometry(250,100,200,20);
    hSlider->setRange(0,100);

    label = new QLabel("滑动条值: 0",this);
    label->setGeometry(250,200,100,20);

    connect(vSlider,SIGNAL(valueChanged(int)),this,SLOT(vSliderValueChanged(int)));
    connect(hSlider,SIGNAL(valueChanged(int)),this,SLOT(hSliderValueChanged(int)));
}

void MainWindow::vSliderValueChanged(int value){
    hSlider->setSliderPosition(value);
}

void MainWindow::hSliderValueChanged(int value){
    /*当水平滑动条的值改变时，改变垂直滑动条的值*/
    vSlider->setSliderPosition(value);
    QString str = "滑动条值: " + QString::number(value);
    label->setText(str);
}
```

### 12、QKeySequenceEdit

QKeySequenceEdit 继承 QWidget。这个小部件允许用户选择 QKeySequence, QKeySequence通常用作快捷方式。当小部件接收到焦点并在用户释放最后一个键后一秒结束时，将启动记录，通常用作记录快捷键。  

##### 代码示例如下

```
#include "mainwindow.h"
#include <QDebug>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    this->setGeometry(0,0,800,480);
    KeySequenceEdit = new QKeySequenceEdit(this);
    KeySequenceEdit->setGeometry(350,200,150,30);

    connect(KeySequenceEdit,SIGNAL(keySequenceChanged(const QKeySequence &)),
            this,SLOT(KeySequenceEditChanged(const QKeySequence &)));
}

void MainWindow::KeySequenceEditChanged(const QKeySequence &keySequence){
    /*判断输入的组合键是否为Ctrl + Q，如果是则退出程序*/
    if(keySequence == QKeySequence(tr("Ctrl+Q"))){
        this->close();
    }else{
        qDebug()<<keySequence.toString()<<endl;
    }
}

```