---
title: esp32_tls密钥交换详解
categories: 嵌入式开发
date: 2025-03-19 22:43:27
tags: "ESP32 TLS\r"
excerpt: <p>esp32 tls密钥交换详解 在 TLS 握手过程中，密钥交换是最核心的环节之一，负责生成共享密钥以实现安全的加密通信。ESP32
  使用 来实现密钥交换，支持多种加密算法（如 RSA、ECDHE、PSK 等）。 本文将结合 TLS 1.2 标准，深入讲解 密钥交换机制 的原理、具体步骤及
  的代码实现。 密钥交换的主要</p>
---

## **ESP32 TLS 握手中的密钥交换机制详解**

在 TLS 握手过程中，密钥交换是最核心的环节之一，负责生成共享密钥以实现安全的加密通信。ESP32 使用 `mbedTLS` 来实现密钥交换，支持多种加密算法（如 RSA、ECDHE、PSK 等）。

本文将结合 TLS 1.2 标准，深入讲解 **密钥交换机制** 的原理、具体步骤及 `mbedTLS` 的代码实现。

# **🔹 一、密钥交换的目标**

密钥交换的主要目的是在客户端和服务器之间安全地生成并共享一个 **对称密钥**，用于加密通信内容。

### 🎯 **关键目标**

✅ 生成双方共享的密钥，确保数据机密性
 ✅ 防止中间人攻击（MitM）
 ✅ 支持前向安全性（Forward Secrecy）

# **🔹 二、常见密钥交换算法**

`mbedTLS` 支持多种密钥交换算法，常见的包括：

| **算法**  | **说明**                            | **特点**                  |
| --------- | ----------------------------------- | ------------------------- |
| **RSA**   | 使用 RSA 公钥加密 Pre-Master Secret | 性能较低，兼容性好        |
| **ECDHE** | 使用椭圆曲线 Diffie-Hellman（推荐） | 安全性高，性能优越        |
| **PSK**   | 预共享密钥 (Pre-Shared Key)         | 无需证书，适用于 IoT 设备 |

> 🔹 **推荐使用 ECDHE (Elliptic Curve Diffie-Hellman Ephemeral)**
> 相比 RSA，ECDHE 具有更好的性能和更强的安全性，ESP-IDF 默认推荐 ECDHE。

# **🔹 三、ECDHE 密钥交换原理详解**

以 **ECDHE (Elliptic Curve Diffie-Hellman Ephemeral)** 为例，详细讲解密钥交换过程。

------

## **📋 ECDHE 密钥交换流程**

```
1. 客户端生成临时密钥对 (ephemeral key pair)
2. 服务器生成临时密钥对
3. 客户端将其公钥发送至服务器
4. 服务器将其公钥返回客户端
5. 客户端和服务器分别计算共享密钥 (Pre-Master Secret)
6. 双方使用 PRF (伪随机函数) 生成 Master Secret
```

## **🔹 Step 1：客户端生成临时密钥对**

客户端通过以下步骤生成临时密钥对：

- 选择椭圆曲线参数 `G`
- 随机生成私钥 `d_C`
- 计算公钥 `Q_C = d_C * G`

**mbedTLS 代码实现：**

```
c
mbedtls_ecdh_context ecdh;
mbedtls_ecdh_init(&ecdh);

// 选择椭圆曲线 SECP256R1 (推荐)
mbedtls_ecp_group_load(&ecdh.grp, MBEDTLS_ECP_DP_SECP256R1);

// 生成私钥 d_C 并计算公钥 Q_C
mbedtls_ecdh_gen_public(&ecdh.grp, &ecdh.d, &ecdh.Q,
                        mbedtls_ctr_drbg_random, &ctr_drbg);
```

------

## **🔹 Step 2：服务器生成临时密钥对**

服务器生成密钥对的步骤类似：

- 选择相同的椭圆曲线参数 `G`
- 随机生成私钥 `d_S`
- 计算公钥 `Q_S = d_S * G`

**mbedTLS 代码实现：**

```
c
mbedtls_ecdh_gen_public(&ecdh.grp, &ecdh.d, &ecdh.Q,
                        mbedtls_ctr_drbg_random, &ctr_drbg);
```

------

## **🔹 Step 3：客户端发送公钥**

客户端将 `Q_C` 发送至服务器（ClientKeyExchange 消息）。

**mbedTLS 内部实现：**

```
c
ret = mbedtls_ssl_write(&ssl, client_public_key, key_len);
```

------

## **🔹 Step 4：服务器发送公钥**

服务器将 `Q_S` 发送回客户端（ServerKeyExchange 消息）。

**mbedTLS 内部实现：**

```
c
ret = mbedtls_ssl_write(&ssl, server_public_key, key_len);
```

------

## **🔹 Step 5：生成共享密钥 (Pre-Master Secret)**

客户端与服务器使用对方的公钥及自己的私钥生成共享密钥：

### 🔹 **客户端计算共享密钥：**

```
ini
Z = d_C * Q_S
```

### 🔹 **服务器计算共享密钥：**

```
ini
Z = d_S * Q_C
```

**mbedTLS 代码实现：**

```
c
mbedtls_ecdh_compute_shared(
    &ecdh.grp,       // 椭圆曲线参数
    &ecdh.z,         // 共享密钥 (Pre-Master Secret)
    &ecdh.Qp,        // 对方公钥 (服务器公钥)
    &ecdh.d,         // 本地私钥 (客户端私钥)
    mbedtls_ctr_drbg_random, &ctr_drbg
);
```

> 🔹 根据椭圆曲线 Diffie-Hellman 的数学特性：
> `d_C * Q_S = d_S * Q_C = Z`

✅ 双方共享密钥 `Z` 一致
 ✅ 外界无法从 `Q_C` 和 `Q_S` 反推 `Z`，确保安全性

------

## **🔹 Step 6：生成会话密钥 (Master Secret)**

共享密钥 `Z` 仅用于临时数据交换。ESP32 使用 `Z`、`Random_C`、`Random_S` 进一步生成 `Master Secret`。

**公式**：

```
java
Master Secret = PRF(Pre-Master Secret + Random_C + Random_S)
```

> `PRF()` 通常使用 `HMAC-SHA256` 算法。

**mbedTLS 代码实现：**

```
c
mbedtls_ssl_derive_keys(&ssl);
```

------

# **🔹 四、密钥交换过程中的安全保障**

### 🔒 **1. 前向安全性 (Forward Secrecy)**

- 即便服务器的私钥泄露，攻击者也无法解密之前的通信数据。
- ECDHE 使用临时密钥对，每次会话重新生成，确保前向安全性。

### 🔒 **2. 防止中间人攻击 (MitM)**

- 服务器使用证书签名其公钥，确保其身份的合法性。
- 客户端验证证书的有效性，以防止伪装。

------

# **🔹 五、常见密钥交换相关问题及解决方案**

| **问题**                            | **可能原因**       | **解决方法**                             |
| ----------------------------------- | ------------------ | ---------------------------------------- |
| `MBEDTLS_ERR_SSL_HANDSHAKE_FAILURE` | 密钥交换失败       | 检查客户端和服务器支持的加密套件是否匹配 |
| `MBEDTLS_ERR_SSL_NO_CIPHER_CHOSEN`  | 加密套件不兼容     | 启用双方兼容的加密算法（推荐 ECDHE）     |
| `MBEDTLS_ERR_SSL_PEER_CLOSE_NOTIFY` | 服务器主动断开连接 | 检查证书、密钥交换算法是否正确           |

------

# **🔹 六、完整流程示意图**

```
pgsql复制编辑Client                           Server
  |--------> ClientHello -------->|
  |<------- ServerHello ----------|
  |<------- Certificate ----------|
  |<------- ServerKeyExchange ----|
  |--------> ClientKeyExchange --->|
  |--------> Finished ------------>|
  |<------- Finished --------------|
```

