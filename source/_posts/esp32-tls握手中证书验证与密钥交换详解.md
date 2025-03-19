---
title: esp32_tls握手中证书验证与密钥交换详解
date: 2025-03-19 22:44:17
tags: ESP32_TLS
---

## **ESP32 TLS 握手中证书验证与密钥交换详解**

在 TLS（Transport Layer Security）握手中，**证书验证** 和 **密钥交换** 是确保通信安全的两个关键环节。以下将结合 `mbedTLS` 源码及 ESP32 实际应用，深入剖析这两个步骤的具体机制、代码实现以及关键点。

# **证书传输与验证（Certificate & Verify）**

服务器在 `ServerHello` 后发送 `Certificate` 消息，客户端（ESP32）需完成以下验证：

 ✅ **证书链完整性**（是否存在缺失证书）
 ✅ **签名有效性**（验证签名是否匹配）
 ✅ **证书有效期**（检查过期时间）
 ✅ **域名匹配**（确保证书的 CN 字段与服务器域名一致）
 ✅ **吊销检查**（可选，通过 OCSP/CRL 检查证书状态）

------

## **📋 Step 3 证书验证流程 (mbedTLS)**

mbedTLS 内部的证书验证过程包括以下关键步骤：

```
1. 接收并解析 Certificate 消息
2. 验证证书链完整性
3. 验证证书签名 (RSA/ECDSA)
4. 验证证书有效期
5. 验证域名匹配 (Host Name)
6. 生成验证结果 (成功/失败)
```

------

### **🟢 1. 接收并解析 Certificate 消息**

在 ESP32 的 `mbedtls_ssl_handshake()` 中，`Certificate` 消息解析由以下代码触发：

🔹 **`ssl_tls.c` 内部流程**

```
c
if ( ( ret = mbedtls_ssl_parse_certificate( ssl ) ) != 0 )
{
    MBEDTLS_SSL_DEBUG_RET( 1, "mbedtls_ssl_parse_certificate", ret );
    return ret;
}
```

- `mbedtls_ssl_parse_certificate()` 接收服务器证书链
- 证书链将存储在 `mbedtls_x509_crt` 结构体中

------

### **🟢 2. 验证证书链完整性**

`mbedtls_x509_crt_verify()` 用于验证服务器提供的证书链。其核心步骤包括：

✅ 检查证书是否被 CA 签名
 ✅ 遍历证书链并检查每个证书的父子关系
 ✅ 确保链条最终指向可信根证书

**代码示例**

```
c
uint32_t flags;
ret = mbedtls_x509_crt_verify(
    &crt,           // 服务器提供的证书链
    &cacert,        // 本地加载的根证书
    NULL,           // CRL (可选)
    "example.com",  // 验证的服务器域名
    &flags,         // 验证结果标志
    NULL, NULL      // 日志输出 (可选)
);
```

------

### **🟢 3. 验证签名 (RSA/ECDSA)**

在 `mbedtls_x509_crt_verify()` 中，签名验证的核心代码如下：

```
c
ret = mbedtls_pk_verify(
    &crt->pk,            // 证书公钥
    MBEDTLS_MD_SHA256,   // 签名使用的哈希算法
    hash, hash_len,      // 待验证的哈希值
    sig, sig_len         // 证书中的签名
);
```

- `mbedtls_pk_verify()` 确保服务器提供的签名与证书内容匹配
- 常见签名算法包括：**RSA**、**ECDSA**

------

### **🟢 4. 验证证书有效期**

`mbedtls_x509_time_is_past()` 和 `mbedtls_x509_time_is_future()` 用于检查时间有效性：

```
c
if ( mbedtls_x509_time_is_past(&crt->valid_to) ) {
    ESP_LOGE(TAG, "证书已过期");
    return MBEDTLS_ERR_X509_CERT_VERIFY_FAILED;
}

if ( mbedtls_x509_time_is_future(&crt->valid_from) ) {
    ESP_LOGE(TAG, "证书尚未生效");
    return MBEDTLS_ERR_X509_CERT_VERIFY_FAILED;
}
```

------

### **🟢 5. 验证域名匹配**

ESP32 检查证书中的 `Common Name (CN)` 字段是否匹配：

```
c
ret = mbedtls_ssl_set_hostname(&ssl, "example.com");  // 目标服务器域名
```

------

### **🟢 6. 生成验证结果**

如果 `flags == 0`，表示验证成功；否则，验证失败。

------

## **🧩 证书验证失败的常见错误码**

| 错误码                                 | 含义           |
| -------------------------------------- | -------------- |
| `MBEDTLS_ERR_X509_CERT_VERIFY_FAILED`  | 证书链验证失败 |
| `MBEDTLS_ERR_X509_CERT_EXPIRED`        | 证书已过期     |
| `MBEDTLS_ERR_X509_CERT_REVOKED`        | 证书已吊销     |
| `MBEDTLS_ERR_X509_CERT_UNKNOWN_FORMAT` | 证书格式错误   |

------

# **🔹 Step 4：密钥交换（Key Exchange）**

密钥交换是 TLS 握手中最核心的安全机制，负责生成对称密钥，以便双方加密数据传输。mbedTLS 中支持以下几种密钥交换算法：

✅ **RSA (最常见，较慢，适用于兼容性强的环境)**
 ✅ **ECDHE (更安全，性能更佳，推荐使用)**
 ✅ **PSK (预共享密钥，适用于 IoT 设备)**

------

## **📋 Step 4 密钥交换流程 (mbedTLS)**

```
1. 客户端生成随机数 Random_C
2. 服务器生成随机数 Random_S
3. 双方协商密钥交换算法 (如 ECDHE)
4. 生成共享密钥 (Pre-Master Secret)
5. 生成对称密钥 (Master Secret)
```

------

### **🟢 1. 生成随机数 (Random_C & Random_S)**

ESP32 在 `mbedtls_ssl_handshake()` 内部自动完成：

```
c
mbedtls_ssl_conf_rng(&conf, mbedtls_ctr_drbg_random, &ctr_drbg);
```

------

### **🟢 2. 协商密钥交换算法**

`mbedtls_ssl_handshake()` 根据服务器的 `ServerHello` 选择合适的加密套件：

```
c
Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
```

------

### **🟢 3. 生成共享密钥 (Pre-Master Secret)**

若使用 ECDHE：

- 客户端发送其公钥 (ClientKeyExchange)
- 服务器生成共享密钥 (Pre-Master Secret)

**ECDHE 生成密钥示例**

```
c
mbedtls_ecdh_context ecdh;
mbedtls_ecdh_gen_public(&ecdh.grp, &ecdh.d, &ecdh.Q, mbedtls_ctr_drbg_random, &ctr_drbg);
```

------

### **🟢 4. 生成对称密钥 (Master Secret)**

客户端和服务器使用以下公式生成最终的 `Master Secret`：

```
java
Master Secret = PRF(Pre-Master Secret + Random_C + Random_S)
```

`PRF()` 通常使用 `HMAC-SHA256` 算法。

------

### **🟢 5. 导出对称加密密钥**

最终用于加密数据的密钥由 `mbedtls_ssl_derive_keys()` 生成。

------

## **🧩 密钥交换失败的常见错误码**

| 错误码                              | 含义               |
| ----------------------------------- | ------------------ |
| `MBEDTLS_ERR_SSL_HANDSHAKE_FAILURE` | 握手失败           |
| `MBEDTLS_ERR_SSL_PEER_CLOSE_NOTIFY` | 服务器主动断开连接 |
| `MBEDTLS_ERR_SSL_NO_CIPHER_CHOSEN`  | 没有匹配的加密套件 |

------

# **🔎 总结**

✅ **Step 3：证书验证**

- 验证证书链的完整性
- 验证证书签名的合法性
- 检查证书有效期和域名匹配

✅ **Step 4：密钥交换**

- 协商密钥交换算法
- 生成共享密钥
- 使用 `Master Secret` 生成会话密钥，确保加密通信的安全性

这两个步骤是 TLS 握手中最核心的环节，理解它们的机制有助于快速调试 ESP32 HTTPS 应用中的安全问题。