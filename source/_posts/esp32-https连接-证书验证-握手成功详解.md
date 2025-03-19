---
title: esp32_https连接-证书验证-握手成功详解
date: 2025-03-19 22:37:23
tags: ESP32_TLS
---

## **ESP32 HTTPS 通信中的 TLS 握手及证书验证详解**

TLS（Transport Layer Security）协议在 ESP32 HTTPS 通信中至关重要。完整的 TLS 握手过程包含 **TCP 连接建立**、**ServerHello**、**证书验证** 和 **密钥协商** 等环节。以下将结合 **ESP32 (mbedTLS)** 的具体流程，详细解析 TLS 握手的内部机制。

# **一、TLS 握手流程概览**

完整的 TLS 握手过程可分为以下几个阶段：

### 🔹 **阶段 1：TCP 连接建立**

> ➡️ ESP32 作为客户端发起 TCP 连接请求，完成三次握手。

### 🔹 **阶段 2：TLS 握手阶段**

> ➡️ 以 `mbedtls_ssl_handshake()` 为核心，包含以下步骤：

1. ClientHello
2. ServerHello
3. 证书传输与验证
4. 密钥交换 (Key Exchange)
5. Finished（握手完成）

### 🔹 **阶段 3：加密通信阶段**

> ➡️ 双方使用协商好的密钥进行加密数据传输。

# **二、TLS 握手的详细过程**

### **🟢 阶段 1：TCP 连接建立**

ESP32 发起 TCP 连接，使用 `mbedtls_net_connect()` 建立 Socket：

```
mbedtls_net_context server_fd;
mbedtls_net_init(&server_fd);

int ret = mbedtls_net_connect(&server_fd, "example.com", "443", MBEDTLS_NET_PROTO_TCP);
if (ret != 0) {
    ESP_LOGE(TAG, "TCP 连接失败: -0x%x", -ret);
    return;
}
```

- `example.com`：服务器域名
- `443`：HTTPS 标准端口

**TCP 三次握手过程**：

```
[Client] SYN ----> [Server]  
[Server] SYN + ACK <---- [Client]  
[Client] ACK ----> [Server]  
```

> ✅ 这一步完成后，TCP 连接已建立，TLS 握手将继续。

------

### **🟢 阶段 2：TLS 握手过程**

ESP32 使用 `mbedtls_ssl_handshake()` 实现 TLS 握手，以下为详细步骤：

------

### **🔹 Step 1：ClientHello（客户端问候）**

- 客户端发送 

  ```
  ClientHello
  ```

   消息，包含：

  - 支持的 TLS 版本
  - 支持的加密算法（如 `ECDHE_RSA_WITH_AES_128_GCM_SHA256`）
  - 随机数 `Random_C`（用于密钥交换）

**示例代码**

```
mbedtls_ssl_context ssl;
mbedtls_ssl_init(&ssl);

mbedtls_ssl_config_defaults(&conf,
    MBEDTLS_SSL_IS_CLIENT,             // 客户端模式
    MBEDTLS_SSL_TRANSPORT_STREAM,      // 流式传输（TCP）
    MBEDTLS_SSL_PRESET_DEFAULT);       // 默认配置

mbedtls_ssl_setup(&ssl, &conf);
mbedtls_ssl_set_hostname(&ssl, "example.com");
```

------

### **🔹 Step 2：ServerHello（服务器问候）**

- 服务器响应 

  ```
  ServerHello
  ```

   消息，包含：

  - 选定的 TLS 版本
  - 选定的加密算法
  - 随机数 `Random_S`（用于密钥交换）
  - 服务器证书

**示例日志输出**

```
[mbedTLS] ServerHello: TLS 1.2
[mbedTLS] Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
```

------

### **🔹 Step 3：证书传输与验证**

服务器通过 `Certificate` 消息发送其证书链（根证书 ➔ 中间证书 ➔ 服务器证书）。

ESP32 执行以下验证：

✅ 验证服务器证书的签名
 ✅ 检查证书是否过期
 ✅ 确认证书中的 CN（Common Name）与目标域名匹配

**示例代码：加载根证书**

```
extern const uint8_t root_cert_pem_start[] asm("_binary_root_cert_pem_start");
extern const uint8_t root_cert_pem_end[] asm("_binary_root_cert_pem_end");

mbedtls_x509_crt cacert;
mbedtls_x509_crt_init(&cacert);

mbedtls_x509_crt_parse(&cacert, root_cert_pem_start,
                      root_cert_pem_end - root_cert_pem_start);

mbedtls_ssl_conf_ca_chain(&conf, &cacert, NULL);
mbedtls_ssl_conf_authmode(&conf, MBEDTLS_SSL_VERIFY_REQUIRED);  // 强制证书校验
```

**证书验证回调（可选）**

```
static int my_verify(void *data, mbedtls_x509_crt *crt, int depth, uint32_t *flags)
{
    if (*flags) {
        ESP_LOGW(TAG, "证书验证失败，错误码: %x", *flags);
        return -1;  // 验证失败
    }
    ESP_LOGI(TAG, "证书验证成功");
    return 0;  // 验证通过
}

mbedtls_ssl_conf_verify(&conf, my_verify, NULL);
```

------

### **🔹 Step 4：密钥交换 (Key Exchange)**

客户端和服务器使用 `Random_C` 和 `Random_S` 生成共享密钥。

- 支持的密钥交换算法包括：
  - **ECDHE**（椭圆曲线 Diffie-Hellman）
  - **RSA**（更常用）

在 ESP-IDF 中，mbedTLS 自动完成此步骤。

------

### **🔹 Step 5：Finished（握手完成）**

- 客户端发送 `Finished` 消息，确认握手完成。
- 服务器响应 `Finished` 消息，确认通信已加密。

**示例代码：触发握手**

```
int ret = mbedtls_ssl_handshake(&ssl);
if (ret != 0) {
    ESP_LOGE(TAG, "TLS/SSL 握手失败: -0x%x", -ret);
    return;
}
ESP_LOGI(TAG, "TLS/SSL 握手成功");
```

------

### **🟢 阶段 3：加密数据传输**

完成 TLS 握手后，ESP32 使用 `mbedtls_ssl_write()` 和 `mbedtls_ssl_read()` 发送和接收加密数据。

```
const char *request = "GET / HTTP/1.1\r\nHost: example.com\r\n\r\n";
mbedtls_ssl_write(&ssl, (const unsigned char *)request, strlen(request));

char response[1024];
mbedtls_ssl_read(&ssl, (unsigned char *)response, sizeof(response));
ESP_LOGI(TAG, "服务器响应:\n%s", response);
```

------

# **三、TLS 握手失败的常见原因及解决方法**

| 错误码    | 错误信息                              | 可能原因           | 解决方法                            |
| --------- | ------------------------------------- | ------------------ | ----------------------------------- |
| `-0x2700` | `MBEDTLS_ERR_X509_CERT_VERIFY_FAILED` | 证书验证失败       | 检查根证书是否正确                  |
| `-0x4f00` | `MBEDTLS_ERR_SSL_CONN_EOF`            | 服务器关闭连接     | 检查服务器配置                      |
| `-0x7100` | `MBEDTLS_ERR_SSL_PEER_CLOSE_NOTIFY`   | 服务器主动关闭连接 | 检查证书有效性及加密算法            |
| `-0x3f00` | `MBEDTLS_ERR_SSL_HANDSHAKE_FAILURE`   | 握手失败           | 检查客户端和服务器的 TLS 版本及算法 |

# **四、总结**

ESP32 TLS 握手流程由 `mbedtls_ssl_handshake()` 主导，涵盖：

✅ **TCP 连接**
 ✅ **ClientHello / ServerHello**
 ✅ **证书验证**
 ✅ **密钥交换**
 ✅ **Finished（握手完成）**