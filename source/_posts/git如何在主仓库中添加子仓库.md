---
title: git如何在主仓库中添加子仓库
categories: 开发工具
date: 2025-05-07 20:03:28
tags: Git
---

# 🔧 添加子模块（子仓库）的步骤：

假设你已经有一个主仓库（main-repo），想在其中添加一个子仓库（libs/lib-repo）。

### ✅ 1. 添加子模块

添加子模块格式：

```
git submodule add <子仓库地址> <本地路径>
```

例子：

```
git submodule add https://github.com/example/lib-repo.git libs/lib-repo
```

这会在`libs/lib-repo`目录中添加子仓库。

### ✅ 2. 初始化并拉取子模块

1、拉去子仓库之后执行

```
git submodule init
git submodule update
```

2、如果你是克隆别人含有子模块的仓库，使用以下命令初始化并拉取子模块内容：

```
git submodule update --init --recursive
```

### ✅ 3. 提交主仓库更改

```
git add .gitmodules libs/lib-repo
git commit -m "添加子模块 libs/lib-repo"
```

### 🧼4. 删除子模块

```
git submodule deinit -f libs/lib-repo
git rm -f libs/lib-repo
rm -rf .git/modules/libs/lib-repo
```

# 🧹 步骤：删除错误路径下的子模块

假设你误添加到了 `wrong/path/lib-repo`，正确路径应是 `libs/lib-repo`。

### ✅ 1. 删除子模块

```
bash复制编辑git submodule deinit -f wrong/path/lib-repo
git rm -f wrong/path/lib-repo
rm -rf .git/modules/wrong/path/lib-repo
```

### ✅ 2. 清理 `.gitmodules` 文件中对应的条目（手动或自动）

手动打开 `.gitmodules` 文件，删除相关的 `[submodule "wrong/path/lib-repo"]` 段落。

如果你想自动处理，也可以这样：

```
git config -f .gitmodules --remove-section submodule.wrong/path/lib-repo
```

------

## 🔁 然后重新添加子模块到正确位置

```
git submodule add https://github.com/example/lib-repo.git libs/lib-repo
git commit -m "修正子模块路径为 libs/lib-repo"
```
