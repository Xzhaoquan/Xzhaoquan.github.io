---
title: window下面实现C串口
date: 2023-09-19 20:59:20
tags: C
---

## 在windows下面实现C串口

代码示例如下

SerialC.h

```
#ifndef __SERIALC_H
#define __SERIALC_H

#include <windows.h>
#include <stdio.h>

#ifdef __cplusplus
extern "C"
{
#endif

    typedef HANDLE PORT;

    extern PORT OpenPort(int idCom);
    extern void ClosePort(PORT idCom);
    extern int SetPortBoudrate(PORT idCom, int rate);
    extern int SetPortDateBits(PORT idCom, int bits);
    extern int SetPortStopBits(PORT idCom, int bits);
    extern int SetPortParity(PORT idCom, int parity);
    extern int GetPortBoudrate(PORT idCom);
    extern int GetPortDataBits(PORT idCom);
    extern int GetPortStopBits(PORT idCom);
    extern int GetPortParity(PORT idCom);
    extern int PortSendDate(PORT idCom, const char *date);
    extern int PortReceiveDate(PORT idCom, char *date, int len);
    extern PORT SerialPortInit(int idCom, int rate, int dateBits, int stopBits, int parity);
    extern int SerialReceiveDate(PORT idCom, char *date, int len);
    extern int SerialSendDate(PORT idCom, const char *date, int len);

#ifdef __cplusplus
}
#endif

#endif

```

SerialC.c

```
#include "SerialC.h"

// #define SDebug
#ifdef SDebug
#define SerialDebug(...) printf(__VA_ARGS__)
#else
#define SerialDebug(...)
#endif

PORT OpenPort(int idCom)
{
	PORT Com;
	TCHAR ComName[128] = {0};
	wsprintf(ComName, TEXT("\\\\.\\COM%d"), idCom);
	Com = CreateFile(ComName,
					 GENERIC_READ | GENERIC_WRITE,
					 0,
					 NULL,
					 OPEN_EXISTING,
					 0,
					 NULL);

	if (Com == INVALID_HANDLE_VALUE)
	{
		return NULL;
	}
	COMMTIMEOUTS timeOuts = {0};
	timeOuts.ReadIntervalTimeout = 50;
	timeOuts.ReadTotalTimeoutConstant = 50;
	timeOuts.ReadTotalTimeoutMultiplier = 10;
	timeOuts.WriteTotalTimeoutConstant = 50;
	timeOuts.WriteTotalTimeoutMultiplier = 10;

	if (SetCommTimeouts(Com, &timeOuts) == FALSE)
	{
		return NULL;
	}
	if (SetCommMask(Com, EV_RXCHAR) == FALSE)
	{
		return NULL;
	}
	SerialDebug("Open %d Success\r\n", idCom);
	return Com;
}

void ClosePort(PORT idCom)
{
	CloseHandle(idCom);
}

int SetPortBoudrate(PORT idCom, int rate)
{
	DCB dcbSerial = {0};
	BOOL Status;
	dcbSerial.DCBlength = sizeof(dcbSerial);
	Status = GetCommState(idCom, &dcbSerial);
	if (Status == FALSE)
	{
		return FALSE;
	}
	dcbSerial.BaudRate = rate;
	Status = SetCommState(idCom, &dcbSerial);
	return Status;
}

int SetPortDateBits(PORT idCom, int bits)
{
	DCB dcbSerial = {0};
	BOOL Status;
	dcbSerial.DCBlength = sizeof(dcbSerial);
	Status = GetCommState(idCom, &dcbSerial);
	if (Status == FALSE)
	{
		return FALSE;
	}
	dcbSerial.ByteSize = bits;
	Status = SetCommState(idCom, &dcbSerial);
	return Status;
}

int SetPortStopBits(PORT idCom, int bits)
{
	DCB dcbSerial = {0};
	BOOL Status;
	dcbSerial.DCBlength = sizeof(dcbSerial);
	Status = GetCommState(idCom, &dcbSerial);
	if (Status == FALSE)
	{
		return FALSE;
	}
	dcbSerial.StopBits = bits;
	Status = SetCommState(idCom, &dcbSerial);
	return Status;
}

int SetPortParity(PORT idCom, int parity)
{
	DCB dcbSerial = {0};
	BOOL Status;
	dcbSerial.DCBlength = sizeof(dcbSerial);
	Status = GetCommState(idCom, &dcbSerial);
	if (Status == FALSE)
	{
		return FALSE;
	}
	dcbSerial.Parity = parity;
	Status = SetCommState(idCom, &dcbSerial);
	return Status;
}

int GetPortBoudrate(PORT idCom)
{
	DCB dcbSerial = {0};
	BOOL Status;
	dcbSerial.DCBlength = sizeof(dcbSerial);
	Status = GetCommState(idCom, &dcbSerial);
	if (Status == FALSE)
	{
		return -1;
	}
	return dcbSerial.BaudRate;
}

int GetPortDataBits(PORT idCom)
{
	DCB dcbSerial = {0};
	BOOL Status;
	dcbSerial.DCBlength = sizeof(dcbSerial);
	Status = GetCommState(idCom, &dcbSerial);
	if (Status == FALSE)
	{
		return -1;
	}
	return dcbSerial.ByteSize;
}

int GetPortStopBits(PORT idCom)
{
	DCB dcbSerial = {0};
	BOOL Status;
	dcbSerial.DCBlength = sizeof(dcbSerial);
	Status = GetCommState(idCom, &dcbSerial);
	if (Status == FALSE)
	{
		return -1;
	}
	return dcbSerial.StopBits;
}

int GetPortParity(PORT idCom)
{
	DCB dcbSerial = {0};
	BOOL Status;
	dcbSerial.DCBlength = sizeof(dcbSerial);
	Status = GetCommState(idCom, &dcbSerial);
	if (Status == FALSE)
	{
		return -1;
	}
	return dcbSerial.Parity;
}

int PortSendDate(PORT idCom, const char *date)
{
	DWORD writeLen = strlen(date);
	DWORD hasWrite;
	BOOL Status = WriteFile(idCom,
							date,
							writeLen,
							&hasWrite,
							NULL);
	if (Status == FALSE)
	{
		return -1;
	}
	else
	{
		// SerialDebug("date Send Success\r\n");
	}
	return hasWrite;
}

int PortReceiveDate(PORT idCom, char *date, int len)
{
	DWORD dwEventMask;
	DWORD hasRead;

	BOOL Status = WaitCommEvent(idCom, &dwEventMask, NULL);
	if (Status == FALSE)
	{
		return FALSE;
	}
	Status = ReadFile(idCom, date, len, &hasRead, NULL);
	date[hasRead] = 0;
	if (Status == FALSE)
	{
		return FALSE;
	}
	else
	{
		// SerialDebug("has Read %d date\r\n",hasRead);
	}
	return TRUE;
}

PORT SerialPortInit(int idCom, int rate, int dateBits, int stopBits, int parity)
{
	int Status = 0;
	PORT Com;
	Com = OpenPort(idCom);
	if (Com == INVALID_HANDLE_VALUE)
	{
		SerialDebug("Open Com%d Fail\r\n", idCom);
		return NULL;
	}
	Status = SetPortBoudrate(Com, rate);
	if (Status == FALSE)
	{
		SerialDebug("Set BoudRate Com%d Fail\r\n", idCom);
		return NULL;
	}
	Status = SetPortDateBits(Com, dateBits);
	if (Status == FALSE)
	{
		SerialDebug("Set dateBits Com%d Fail\r\n", idCom);
		return NULL;
	}
	stopBits = ONESTOPBIT;
	Status = SetPortStopBits(Com, stopBits);
	if (Status == FALSE)
	{
		SerialDebug("Set stopBits Com%d Fail\r\n", idCom);
		return NULL;
	}
	Status = SetPortParity(Com, parity);
	if (Status == FALSE)
	{
		SerialDebug("Set Parity Com%d Fail\r\n", idCom);
		return NULL;
	}
	return Com;
}

int SerialReceiveDate(PORT idCom, char *date, int len)
{
	DWORD dwEventMask;
	DWORD NoByteRead = 0;

	BOOL Status = WaitCommEvent(idCom, &dwEventMask, NULL);
	if (Status == FALSE)
	{
		return -1;
	}
	Status = ReadFile(idCom, date, len, &NoByteRead, NULL);
	date[NoByteRead] = 0;
	if (Status == FALSE)
	{
		return -1;
	}
	else
	{
		SerialDebug("receive :%s\r\n", date);
	}
	return NoByteRead;
}

int SerialSendDate(PORT idCom, const char *date, int len)
{
	DWORD hasWrite;
	BOOL Status = WriteFile(idCom,
							date,
							len,
							&hasWrite,
							NULL);
	if (Status == FALSE)
	{
		return -1;
	}
	else
	{
		SerialDebug("Send :%s\r\n", date);
	}
	return hasWrite;
}
```

