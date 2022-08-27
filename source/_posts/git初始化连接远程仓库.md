---
title: git初始化连接远程仓库
date: 2022-08-26 22:47:35
tags: git
---

## 如何使用git

#### 1、安装完git之后一开始需要配置全局git（每个操作系统只需要初始化一次）

```
//配置用户名
git config --global user.name "yourname"
//配置邮箱
git config --global user.email "youremail"
//查看是否配置成功
git config --list --global
```

#### 2、初始化git仓库

```
git init
```

#### 3、配置ssh公钥

- 生成公钥

  ```
  ssh-keygen -t rsa -C "youremail" //youremail是前面global配置的email
  ```

- 查看获取公钥

  ```
  cat ~/.ssh/id_rsa.pub
  ```

  

- 将获取到的公钥添加到gitee上面

- 查看公钥是否配置成功

  ```
  ssh -T git@gitee.com
  ```

- 远程仓库的添加和查看

  ```
  //远程仓库添加
  git remote add origin +(远程仓库地址)
  //git remote add origin git@gitee.com:linux_4/drivers-imx6ull.git
  //查看远程仓库
  git remote
  ```

- 拉取远程分支

  ```
  git pull origin master 
  ```

  