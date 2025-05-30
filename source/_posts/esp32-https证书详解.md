---
title: esp32_https证书详解
date: 2025-03-19 22:39:01
tags: ESP32_TLS
---

## **一、HTTPS 证书验证机制概述**

在 HTTPS 通信中，服务器会向客户端提供一个**服务器证书**。客户端要验证该证书的合法性，确保它是由**可信的证书颁发机构 (CA, Certificate Authority)** 签发的。这个验证过程依赖于**证书链 (Certificate Chain)**。

## **二、证书链 (Certificate Chain) 结构**

证书链通常包含以下几部分：

1. 服务器证书 (Server Certificate)
   - 由中间 CA 签发，包含服务器域名、有效期、公钥等信息。
2. 中间证书 (Intermediate Certificate)
   - 由根 CA 签发，专门用于签发服务器证书。
3. 根证书 (Root Certificate)
   - 最顶层的证书，由受信任的 CA 机构（如 Let's Encrypt、DigiCert 等）签名。根证书是自签名的（即自己签发自己）。

### **证书链验证过程**

1. **服务器发送其证书及中间证书给客户端。**
2. **客户端利用本地存储的根证书，验证中间证书的有效性。**
3. **中间证书验证成功后，再验证服务器证书。**
4. 如果整个链条无误，则认为服务器的证书有效，通信可继续；否则连接会被终止。

## **三、ESP32 校验根证书的原因**

ESP32 无法像常规 PC 或手机那样，内置完整的 CA 证书列表。因此，ESP32 需要手动提供可信任的**根证书**来验证服务器证书。

### **为什么不能仅靠服务器证书？**

- **防止中间人攻击 (MITM)**：攻击者可以伪造一个看似合法的证书，而没有根证书验证机制时，ESP32 可能无法识别该伪造证书。
- **确保服务器身份**：根证书属于权威 CA，并已通过严格的安全审计，因此可信度更高。

### **根证书的作用**

- 确认证书签发者的合法性（防止假冒 CA）
- 验证服务器证书是否属于可信 CA 签发的证书
- 防止服务器使用过期、吊销或伪造的证书

## **四、根证书的获取方法**

1. **浏览器导出**

   - 在 Chrome/Firefox 打开目标 HTTPS 网站
   - 点击 🔒（锁）图标 → **证书 (Certificate)**
   - 找到**根证书** → 导出为 `.pem` 格式

2. **使用命令行工具 `openssl`**

   ```
   openssl s_client -showcerts -connect example.com:443
   ```

3. **公共 CA 机构网站**

   - 例如 Let's Encrypt、[DigiCert](https://www.digicert.com/) 等提供根证书下载

## **五、ESP32 根证书验证失败的常见问题**

1. **证书过期**：根证书可能已过期，需要替换为最新的版本。

2. **证书链不完整**：服务器未正确配置中间证书，导致验证失败。

3. **时钟未同步**：ESP32 启动时未正确设置系统时间，导致证书有效期判断出错。

4. 证书编码格式错误

   ：ESP32 要求根证书为 PEM 格式 

   ```
   .pem
   ```

   若为 DER 格式需转换：

   ```
   openssl x509 -inform DER -in cert.der -out cert.pem
   ```

## **六、总结**

ESP32 校验服务器证书时需要根证书，主要是为了确保服务器的可信度，防止中间人攻击及证书伪造。由于 ESP32 资源有限，ESP-IDF 默认未内置 CA 证书链，因此开发者需要手动提供根证书，确保 HTTPS 请求的安全性。