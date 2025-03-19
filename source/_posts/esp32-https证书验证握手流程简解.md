---
title: esp32_https证书验证握手流程简解
date: 2025-03-19 22:40:11
tags: ESP32_TLS
---

### **ESP32 证书验证的详细过程 (mbedTLS 内部机制)**

ESP32 通过 `mbedTLS` 进行 TLS/SSL 加密通信，证书验证是其中的关键环节。以下将结合 `mbedTLS` 代码深入讲解证书验证的内部机制，帮助理解其背后的原理和流程。

## **一、mbedTLS 证书验证的核心模块**

在 `mbedTLS` 中，证书验证的核心模块包括以下几个组件：

| 模块                       | 功能说明                        |
| -------------------------- | ------------------------------- |
| `mbedtls_x509_crt`         | 证书解析及存储结构              |
| `mbedtls_ssl_config`       | TLS/SSL 配置，定义验证模式      |
| `mbedtls_ssl_set_authmode` | 设置证书验证模式                |
| `mbedtls_ssl_handshake`    | 执行 TLS/SSL 握手并触发证书验证 |
| `mbedtls_ssl_conf_verify`  | 设置自定义回调，手动验证证书    |

------

## **二、mbedTLS 证书验证的详细流程**

在 ESP-IDF 中，HTTPS 客户端的证书验证大致可分为以下 5 个步骤：

------

### **Step 1：初始化 mbedTLS 核心结构体**

初始化 TLS/SSL 相关的核心结构体：

```
mbedtls_ssl_context ssl;          // SSL 会话上下文
mbedtls_ssl_config conf;          // SSL 配置结构体
mbedtls_x509_crt cacert;          // CA 根证书
mbedtls_ctr_drbg_context ctr_drbg; // 随机数生成器
mbedtls_entropy_context entropy;   // 熵（Entropy）源
```

**初始化结构体：**

```
mbedtls_ssl_init(&ssl);
mbedtls_ssl_config_init(&conf);
mbedtls_x509_crt_init(&cacert);
mbedtls_ctr_drbg_init(&ctr_drbg);
mbedtls_entropy_init(&entropy);
```

------

### **Step 2：加载根证书**

ESP32 使用 `.pem` 格式的根证书来校验服务器证书。

```
extern const uint8_t root_ca_pem_start[] asm("_binary_root_cert_pem_start");
extern const uint8_t root_ca_pem_end[] asm("_binary_root_cert_pem_end");

mbedtls_x509_crt_parse(&cacert, root_ca_pem_start,
                       root_ca_pem_end - root_ca_pem_start);
```

> ✅ `mbedtls_x509_crt_parse()` 会解析证书链，包括根证书和中间证书。
> ❗ 若解析失败，返回 `MBEDTLS_ERR_X509_CERT_UNKNOWN_FORMAT` 表示格式不正确。

------

### **Step 3：配置 SSL 会话**

配置 TLS/SSL 参数，包括证书链、验证模式等。

```
	mbedtls_ssl_config_defaults(&conf,
    MBEDTLS_SSL_IS_CLIENT,     // 客户端模式
    MBEDTLS_SSL_TRANSPORT_STREAM, // TCP 传输
    MBEDTLS_SSL_PRESET_DEFAULT);  // 默认配置
```

将根证书链与 SSL 配置结构体绑定：

```
mbedtls_ssl_conf_ca_chain(&conf, &cacert, NULL);  // 设置 CA 证书链
```

设置认证模式，确保启用强制验证：

```
mbedtls_ssl_conf_authmode(&conf, MBEDTLS_SSL_VERIFY_REQUIRED);  // 强制验证
```

------

### **Step 4：设置随机数生成器**

TLS/SSL 依赖加密算法，因此需要可靠的随机数源。

```
mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy, NULL, 0);
mbedtls_ssl_conf_rng(&conf, mbedtls_ctr_drbg_random, &ctr_drbg);
```

------

### **Step 5：绑定回调函数 (可选，自定义验证)**

ESP-IDF 提供默认的验证机制，但也可通过 `mbedtls_ssl_conf_verify()` 添加自定义验证逻辑。

✅ **回调函数示例：**

```
static int my_verify(void *data, mbedtls_x509_crt *crt, int depth, uint32_t *flags) 
{
    char buf[512];
    mbedtls_x509_crt_info(buf, sizeof(buf) - 1, "", crt);

    ESP_LOGI(TAG, "证书深度: %d\n%s", depth, buf);

    if (*flags) {
        ESP_LOGW(TAG, "证书验证失败，错误码: %x", *flags);
        return -1;  // 验证失败，终止连接
    }

    ESP_LOGI(TAG, "证书验证成功");
    return 0;  // 验证通过
}
```

注册回调函数：

```
mbedtls_ssl_conf_verify(&conf, my_verify, NULL);
```

------

### **Step 6：启动 TLS/SSL 握手**

通过 `mbedtls_ssl_handshake()` 触发证书验证。

```
if ((ret = mbedtls_ssl_handshake(&ssl)) != 0) {
    ESP_LOGE(TAG, "TLS/SSL 握手失败: -0x%x", -ret);
} else {
    ESP_LOGI(TAG, "TLS/SSL 握手成功");
}
```

> ❗ 握手失败可能是证书无效、过期、或不匹配导致的，具体错误可参考 `ret` 的返回码。

------

### **Step 7：关闭连接并释放资源**

证书验证完成后，释放相关资源以避免内存泄漏：

```
mbedtls_ssl_free(&ssl);
mbedtls_ssl_config_free(&conf);
mbedtls_x509_crt_free(&cacert);
mbedtls_ctr_drbg_free(&ctr_drbg);
mbedtls_entropy_free(&entropy);
```

------

## **三、证书验证失败的常见错误码**

`mbedTLS` 的证书验证错误信息较为具体，以下是一些常见错误及其原因：

| 错误码    | 错误信息                               | 可能原因           | 解决方法                         |
| --------- | -------------------------------------- | ------------------ | -------------------------------- |
| `-0x2700` | `MBEDTLS_ERR_X509_CERT_VERIFY_FAILED`  | 证书链验证失败     | 确保使用正确的根证书             |
| `-0x270D` | `MBEDTLS_ERR_X509_CERT_EXPIRED`        | 证书已过期         | 检查 ESP32 的系统时间是否准确    |
| `-0x270C` | `MBEDTLS_ERR_X509_CERT_REVOKED`        | 证书已吊销         | 检查证书的吊销状态               |
| `-0x2708` | `MBEDTLS_ERR_X509_CERT_UNKNOWN_FORMAT` | 证书格式错误       | 确认证书为 `.pem` 格式           |
| `-0x7100` | `MBEDTLS_ERR_SSL_PEER_CLOSE_NOTIFY`    | 服务器主动关闭连接 | 检查服务器端的配置和证书链完整性 |

## **四、调试技巧**

1. **启用详细日志**
   在 `menuconfig` 中启用 mbedTLS 的调试日志：

```
Component config  ---> 
    mbedTLS  ---> 
        Enable mbedTLS debugging (最大等级为 4)
```

1. **输出证书信息** 添加 `mbedtls_x509_crt_info()` 打印证书的详细信息：

```
char buf[1024];
mbedtls_x509_crt_info(buf, sizeof(buf) - 1, "", &cacert);
ESP_LOGI(TAG, "证书信息:\n%s", buf);
```

1. **使用 `openssl` 检查证书链**

```
bash
openssl s_client -connect example.com:443
```

