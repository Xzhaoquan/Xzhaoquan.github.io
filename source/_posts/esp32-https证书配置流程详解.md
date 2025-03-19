---
title: esp32_https证书配置流程详解
date: 2025-03-19 22:38:20
tags: ESP32_TLS
---

## **一、ESP32 证书校验的原理**

ESP32 使用 **mbedTLS** 作为底层 TLS/SSL 协议栈来实现 HTTPS 加密通信。其证书验证机制基于 X.509 标准，确保服务器的身份安全，防止中间人攻击 (MITM)。

### **核心验证要点**

- **验证服务器证书的签名**（确保该证书由受信任的 CA 签发）
- **验证证书的有效期**（证书是否已过期）
- **验证证书的域名 (Common Name, CN) 是否匹配**
- **检查证书吊销状态（可选）**

## **二、ESP32 证书校验流程**

ESP32 在 HTTPS 请求中，完整的证书校验流程如下：

1. **客户端初始化 TLS 会话**
   - ESP32 使用 `esp_http_client` 作为 HTTP 客户端，并在配置中指定 `cert_pem` 字段。
2. **服务器响应证书**
   - 服务器返回其 **服务器证书** 及（可能）**中间证书**。
3. **mbedTLS 验证证书链**
   - 检查服务器证书的**签名**是否正确。
   - 根据提供的根证书，验证**中间证书**的签名。
   - 如果链条完整并通过验证，则该服务器是可信任的。
4. **检查服务器证书的其他信息**
   - 验证域名 (Common Name, CN) 是否匹配。
   - 验证证书的有效期。
   - 检查吊销状态（如启用 CRL/OCSP 时）。
5. **完成握手，建立安全连接**

## **三、ESP32 证书配置**

在 ESP-IDF 的 `esp_http_client_config_t` 配置结构中，以下字段与证书校验密切相关：

### **1. 指定根证书 (Root CA)**

根证书是校验链条中最关键的一环，ESP-IDF 提供了以下两种方法配置：

- **静态内嵌根证书**（推荐）
  使用编译时嵌入的 PEM 格式证书。

```
extern const char server_cert_pem_start[] asm("_binary_root_cert_pem_start");
extern const char server_cert_pem_end[] asm("_binary_root_cert_pem_end");

esp_http_client_config_t config = {
    .url = "https://example.com",
    .cert_pem = server_cert_pem_start,   // 根证书
    .event_handler = http_event_handler,
    .method = HTTP_METHOD_GET,
};
```

> **嵌入 PEM 文件步骤**
>
> - 将 `.pem` 证书放入 `main` 目录下
>
> - 在 
>
>   ```
>   CMakeLists.txt
>   ```
>
>    中添加：
>
>   ```
>   cmake
>   ```
>
>
>   复制编辑
>   set(COMPONENT_EMBED_TXTFILES root_cert.pem)
>
>   ```
> 
>   ```

------

- **动态加载根证书**（适合证书更新场景）
  通过 SPIFFS/NVS 读取并传入 `cert_pem` 字段：

```
const char *cert_buf = NULL;
load_cert_from_spiffs(&cert_buf);  // 自定义加载函数

esp_http_client_config_t config = {
    .url = "https://example.com",
    .cert_pem = cert_buf,  
    .event_handler = http_event_handler,
    .method = HTTP_METHOD_GET,
};
```

### **2. 跳过证书验证（不推荐）**

仅用于调试目的，生产环境应避免使用。

```
esp_http_client_config_t config = {
    .url = "https://example.com",
    .skip_cert_common_name_check = true,  // 跳过CN校验
};
```

## **四、证书验证的详细过程 (mbedTLS 内部机制)**

ESP-IDF 基于 `mbedTLS` 的 `ssl` 模块来验证证书。内部流程大致如下：

1. **根证书加载**

   - ESP32 读取 `.pem` 格式的根证书，并初始化 `mbedtls_x509_crt` 结构体。
   - 示例：

   ```
   mbedtls_x509_crt cert;
   mbedtls_x509_crt_init(&cert);
   mbedtls_x509_crt_parse(&cert, (const unsigned char *)root_ca, strlen(root_ca) + 1);
   ```

2. **SSL/TLS 会话初始化**

   - ```
     mbedtls_ssl_config
     ```

      配置结构体初始化，并设置以下选项：

     - 证书链
     - 证书验证回调函数（自定义验证）

3. **证书校验**

   - 通过 

     ```
     mbedtls_ssl_set_authmode()
     ```

      设置验证模式：

     - `MBEDTLS_SSL_VERIFY_REQUIRED`（强制验证）
     - `MBEDTLS_SSL_VERIFY_OPTIONAL`（可选验证）
     - `MBEDTLS_SSL_VERIFY_NONE`（不验证，危险）

4. **回调函数处理**

   - ESP-IDF 默认的 `http_event_handler` 会捕获验证失败的事件，并输出详细日志。

## **五、证书验证失败的常见原因及解决方案**

### **1. 证书过期**

- **原因**：ESP32 的时钟可能未同步，导致验证时误认为证书已过期。
- **解决方法**：在启动时使用 NTP 进行时间同步。

```
sntp_setoperatingmode(SNTP_OPMODE_POLL);
sntp_setservername(0, "pool.ntp.org");
sntp_init();
```

### **2. 根证书不匹配**

- **原因**：根证书不匹配服务器的证书链。
- **解决方法**：使用 `openssl` 检查证书链并替换根证书。

```
openssl s_client -showcerts -connect example.com:443
```

------

### **3. PEM 格式错误**

- **原因**：ESP32 要求使用 `.pem` 格式的证书。
- **解决方法**：使用以下命令转换：

```
openssl x509 -inform DER -in cert.der -out cert.pem
```

### **4. 证书链不完整**

- **原因**：服务器未正确配置中间证书。
- **解决方法**：联系服务器维护人员，确保完整证书链配置。

------

### **5. CN (Common Name) 不匹配**

- **原因**：服务器证书的 CN 字段与请求 URL 不一致。
- **解决方法**：检查 URL 是否拼写正确，或通过 `skip_cert_common_name_check = true` 绕过 CN 校验（不推荐）。