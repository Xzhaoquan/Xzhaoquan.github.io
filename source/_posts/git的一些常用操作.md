---
title: git的一些常用操作
date: 2022-08-26 21:42:20
tags: git
---

## git常用命令

##### 1、单个文件加入缓存区

```
git add +需要加入缓存的文件
git add . //将所有文件加入跟踪
```

##### 2、撤销add添加缓存命令

```
git reset + 想要撤销的文件
git reset . //撤销add 的所有文件
```

##### 3、将缓存区里面的内容提交/修改

```
//提交
git commit -m "需要添加的注释"
//修改commit提交的信息
git commit --amend + 修改commit提交的信息
```

##### 4、创建分支/查看分支/切换分支/合并分支

```
//创建分支
git branch + 创建分支名
//查看分支
git branch
//切换分支
git checkout + 切换分支名

//切换分支 如果没有分支就创建分支 
git checkout -b +分支名

//分支合并
git merge + 分支名称
```

##### 5、删除分支

```
//删除时需要做检查
git branch -d +分支名称 （要做检查的删除分支）
//删除时不需要做任何检查
git branch -D +分支名称 （不做任何检查的强制删除）
```

##### 6、查看提交的历史信息

```
//查看提交的详细历史信息
git log git log --graph --oneline (以图形化界面查看)
//获取每条日志的简要信息
git log --pretty=oneline
//查看本地的操作历史
git reflog
```

##### 7、配置SSH公钥

```
//生成公钥
ssh-keygen -t rsa -C "youremail@example.com"
//获取公钥
cat ~/.ssh/id_rsa.pub
//查看公钥是否添加成功
 ssh -T git@gitee.com
```

##### 8、远程仓库的添加/推送/查看/删除/拉取

```
//远程仓库的添加
git remote add origin +(远程仓库地址)
//远程仓库的查看
 git remote
//远程仓库的推送
 git push origin master
 git pull --rebase origin master（如果推送不成功使用这个）（保持远端和本地数据同步）
 //与远端分支关系绑定
  git push --set-upstream origin master:master （与远端关系绑定） （本地master） (远端master)
 //删除指定远程分支
  git push origin --delete master git push origin :master
 //指定拉取分支
 git pull origin master（如果pull出现冲突，可以版本回退和 封存修改，pull之后在还原）
```

##### 9、查看本地分支与远程分支的对应关系

```
git branch -vv
```

##### 10、git克隆

```
 git clone + 克隆地址
```

##### 11、git版本回退

```
//git 回退到你想要回退的版本号
git reset --hard + 版本对应的id
```

##### 12、强制拉取合并分支

```
git pull origin master --allow-unrelated-histories
```

##### 13、删除远程仓库

```
git remote rm origin 
```

##### 14、创建远端仓库分支

```
git pull origin + 本地分支
```

