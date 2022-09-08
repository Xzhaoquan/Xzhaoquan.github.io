---
title: 使用hexo搭建个人博客
date: 2022-09-09 00:21:19
tags: hexo
---

## 使用hexo搭建个人博客

### 1、安装环境依赖

- 安装git（按照默认操作即可）

  ```
  如果点击鼠标右键 能够打开git bash 说明git 安装成功
  ```

- 安装node.js

  ```
  鼠标右键打开git bash
  查看node 是否安装成功
  node -v
  ```

- 安装hexo

  ```
  安装hexo
  1、桌面新建一个文件夹 blog，git bash 进入文件夹
  2、设置淘宝镜像原（npm config set registry http://registry.npm.taobao.org）//可要可不要
  3、安装hexo npm install hexo-cli -g
  4、检测hexo是否安装完成 hexo -v 
  ```

  

### 生成博客文件

- 生成博客文件

  ```
  打开git
  hexo init blog(如果没有进入到blog文件夹)
  hexo init (如果进入到blog文件夹)
  ```

- 预览博客文件

  ```
  hexo s
  将生成的网址复制到网页执行，可以看到博客文件
  ```

  

### 部署博客到gitee平台

- 在gitee创建一个仓库，创建仓库名称使用gitee用户名。（如果不适用用户名，需要再仓库名后面加.gitee.io）

- 仓库创建成功后，复制HTTP 链接网址。

- 配置博客配置文件 _config.yml

  ```
  deploy:
    type: 'git' //选择git
    repo: https://gitee.com/yys_cn_ccs/zhaoqaun.git //gitee http 链接地址
    branch: master	//git 分支的配置
  ```

- 安装hexo部署工具

  ```
  npm install hexo-deployer-git --save
  ```

- 生成静态链接文件（public）

  ```
  hexo g
  ```

- 部署（需要输入gitee用户名字加密码）

  ```
  hexo d
  ```

  

### 开启gitee服务

- 打开gitee 点击右上角“服务”----选择Gitee Pages 点击部署。

### 设置hexo主题

1、去找到自己希望的 hexi主题，搜索主题名字。

2、将下载好的主题下载后放在 themes 文件下面 ，然后配置博客配置文件 _config.yml，将langscape修改成需要配置的主题名字。如果主题需要一些依赖，根据作者下面提示安装

```
# Extensions
## Plugins: https://hexo.io/plugins/
## Themes: https://hexo.io/themes/
theme: landscape
```

3、安装pure

```
git clone https://github.com/cofess/hexo-theme-pure.git themes/pure
```

4、pure的依赖

```
npm install hexo-wordcount --save
npm install hexo-generator-json-content --save
npm install hexo-generator-feed --save
npm install hexo-generator-sitemap --save
npm install hexo-generator-baidu-sitemap --save
```



### 使用hexo开始写博客

- 开始写博客

  ```
  hexo new newpapername
  ```

- 博客写完之后

  ```
  hexo clean
  hexo g
  hexo d
  ```

### hexo基本配置

#### 网站

| 参数          | 描述                                                         |
| ------------- | ------------------------------------------------------------ |
| `title`       | 网站标题                                                     |
| `subtitle`    | 网站副标题                                                   |
| `description` | 网站描述                                                     |
| `author`      | 您的名字                                                     |
| `language`    | 网站使用的语言                                               |
| `timezone`    | 网站时区。Hexo 默认使用您电脑的时区。[时区列表](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)。比如说：`America/New_York`, `Japan`, 和 `UTC` 。 |

#### 网址

| 参数                 | 描述                                                         |
| -------------------- | ------------------------------------------------------------ |
| `url`                | 网址                                                         |
| `root`               | 网站根目录                                                   |
| `permalink`          | 文章的 [永久链接](https://hexo.io/zh-cn/docs/permalinks) 格式 |
| `permalink_defaults` | 永久链接中各部分的默认值                                     |

