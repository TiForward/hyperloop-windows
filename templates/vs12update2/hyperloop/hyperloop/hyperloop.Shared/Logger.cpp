/* START jsc/templates/doc.ejs */
/**
 * Copyright (c) 2013 by Appcelerator, Inc. All Rights Reserved.
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 *
 * This generated code and related technologies are covered by patents
 * or patents pending by Appcelerator, Inc.
 */

// WARNING: This file is generated and will be overwritten.
// Generated on Wed May 28 2014

// If you're checking out this file, you should check us out too.
// http://jobs.appcelerator.com
/* END jsc/templates/doc.ejs */
#include "Logger.h"
#include <ppltasks.h>
using namespace concurrency;

static Windows::Storage::StorageFile ^logFile = nullptr;
static bool logFileGenerating = false;
static Platform::Array<Platform::String ^> ^logQueue = ref new Platform::Array<Platform::String ^>(100);
static int logIndex = 0;

void Logger::log(Platform::String ^string) {
	string += "\r\n";
	OutputDebugString(std::wstring(string->Data()).c_str());
	if (logFileGenerating) {
		OutputDebugString(L"Queued...\r\n");
		logQueue[logIndex++] = string;
	}
	else if (logFile == nullptr) {
		logFileGenerating = true;
		OutputDebugString(L"Queued...\r\n");
		logQueue[logIndex++] = string;
		OutputDebugString(L"Creating log file...\r\n");
		auto logFolder = Windows::Storage::ApplicationData::Current->LocalFolder;
		auto task = create_task(logFolder->CreateFileAsync("log.txt", Windows::Storage::CreationCollisionOption::ReplaceExisting));
		task.then([](Windows::Storage::StorageFile ^file) {
			OutputDebugString(std::wstring(("Created log file at " + file->Path + "\r\n")->Data()).c_str());
			logFile = file;
			if (logIndex > 0) {
				auto output = logQueue[0];
				for (int i = 1; i < logIndex; i++) {
					output += logQueue[i];
				}
				Windows::Storage::FileIO::AppendTextAsync(logFile, output);
			}
			logIndex = 0;
			logQueue = nullptr;
			logFileGenerating = false;
		});
	}
	else {
		Windows::Storage::FileIO::AppendTextAsync(logFile, string);
	}
}