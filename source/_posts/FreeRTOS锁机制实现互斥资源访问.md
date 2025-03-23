---
title: FreeRTOS锁机制实现互斥资源访问
date: 2025-03-23 12:32:49
tags: FreeRTOS
---

在FreeRTOS中实现锁机制（即互斥访问共享资源）主要通过**互斥锁（Mutex）** 和 **信号量（Semaphore）** 实现。以下是具体实现方法及示例：

------

### 一、使用互斥锁（Mutex）

互斥锁是专为资源互斥访问设计的机制，支持优先级继承（防止优先级反转问题），是保护共享资源的最佳选择。

#### 实现步骤：

1. **创建互斥锁**
   使用 `xSemaphoreCreateMutex()` 创建互斥锁句柄。

   ```
   SemaphoreHandle_t xMutex = xSemaphoreCreateMutex();
   ```

2. **获取锁（在访问资源前）**
   使用 `xSemaphoreTake()` 获取锁，若锁已被占用，任务将阻塞等待（可设置超时时间）。

   ```
   if (xSemaphoreTake(xMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
       // 成功获取锁，访问共享资源
   } else {
       // 超时处理
   }
   ```

3. **释放锁（在访问资源后）**
   使用 `xSemaphoreGive()` 释放锁，允许其他任务获取。

   ```
   xSemaphoreGive(xMutex);
   ```

#### 完整示例：

```
#include "FreeRTOS.h"
#include "semphr.h"

SemaphoreHandle_t xMutex;

void Task1(void *pvParam) {
    while (1) {
        if (xSemaphoreTake(xMutex, portMAX_DELAY)) {
            // 访问共享资源（如UART、全局变量等）
            printf("Task1 is using the resource.\n");
            xSemaphoreGive(xMutex);
        }
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void Task2(void *pvParam) {
    while (1) {
        if (xSemaphoreTake(xMutex, portMAX_DELAY)) {
            // 访问共享资源
            printf("Task2 is using the resource.\n");
            xSemaphoreGive(xMutex);
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

int main() {
    xMutex = xSemaphoreCreateMutex();
    xTaskCreate(Task1, "Task1", configMINIMAL_STACK_SIZE, NULL, 2, NULL);
    xTaskCreate(Task2, "Task2", configMINIMAL_STACK_SIZE, NULL, 1, NULL);
    vTaskStartScheduler();
    return 0;
}
```

------

### 二、使用二进制信号量（Binary Semaphore）

二进制信号量也可用于互斥，但**无优先级继承机制**，可能导致优先级反转问题，仅适用于简单场景。

#### 实现步骤：

1. **创建信号量**

   ```
   SemaphoreHandle_t xSemaphore = xSemaphoreCreateBinary();
   xSemaphoreGive(xSemaphore); // 初始化为可用状态
   ```

2. **获取与释放信号量**
   类似互斥锁，使用 `xSemaphoreTake()` 和 `xSemaphoreGive()`。

------

### 三、递归锁（Recursive Mutex）

允许同一任务多次获取锁而不死锁，适用于递归函数或嵌套调用。

#### 实现步骤：

1. **创建递归锁**

   ```
   SemaphoreHandle_t xRecursiveMutex = xSemaphoreCreateRecursiveMutex();
   ```

2. **递归获取与释放**
   使用 `xSemaphoreTakeRecursive()` 和 `xSemaphoreGiveRecursive()`：

   ```
   xSemaphoreTakeRecursive(xRecursiveMutex, portMAX_DELAY);
   // 嵌套调用中再次获取
   xSemaphoreTakeRecursive(xRecursiveMutex, portMAX_DELAY);
   xSemaphoreGiveRecursive(xRecursiveMutex);
   xSemaphoreGiveRecursive(xRecursiveMutex);
   ```

------

### 四、关键注意事项

1. **优先级继承**
   互斥锁（Mutex）支持优先级继承，能自动提升低优先级任务的优先级以缩短阻塞时间，避免优先级反转。
2. **中断服务程序（ISR）中的锁**
   在ISR中需使用 `xSemaphoreTakeFromISR()` 和 `xSemaphoreGiveFromISR()`，且不能阻塞。
3. **死锁预防**
   - 确保获取锁后一定会释放。
   - 避免多锁嵌套（如先锁A再锁B，其他任务反之可能导致死锁）。

------

### 五、总结

- **推荐使用互斥锁（Mutex）** 保护共享资源，因其支持优先级继承。
- 避免在中断中使用普通互斥锁，优先考虑信号量或任务通知。
- 递归锁适用于嵌套资源访问场景。