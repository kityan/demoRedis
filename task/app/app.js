/// <reference path="./../typings/node/node.d.ts" />
'use strict';

process.chdir(__dirname);

var 
	util = require("util"),
	redis = require("redis"),
	config = require("./modules/config.js");

var
 	getErrors = false, // получить ошибки и завершиться?
	client,	// redis клиент
	taskId,	// taskId
	isGenerator = false, // режим генератора?
	generated = {total: 0},	// сколько сгенерировано сообщений в режиме генератора
	processed = {total: 0, errors: 0}, // сколько обработано сообщений и сколько ошибок обработки 
	monitored = false, // запущено через monitor?
	cnt;

// анализируем параметры запуска	
process.argv.forEach(function(el){
	switch (el){
		case "getErrors": getErrors = true; break;
		case "monitored": monitored = true; break;
	}
});	

// соединяемся
client = redis.createClient({host: config.db.host, port: config.db.port});

client.on('error', function(err){
	console.log(err);
	process.exit();
});

// если задан пароль - авторизуемся
if (config.db.pass){
	client.auth(config.db.pass, auth_cb);
} else {
	auth_cb();
}


/**
 * Колбек авторизации
 */ 
function auth_cb(){
	if (getErrors){
		getErrorsAndDie();
	} else {
		requestTaskId();	
	}
}


/**
 * Запрос идентификатора задания
 */ 
function requestTaskId(){
    client.incr('taskId', requestTaskId_cb);
}

/**
 * Колбек запроса идентификатора задания
 */ 
function requestTaskId_cb(err, data){
	if (err === null){
		// запоминаем присвоенный процессу taskId
		taskId = parseInt(data);

		// если запущено через монитор, сообщаем ему о taskId
		if (monitored){
			console.log(JSON.stringify({msg: 'createdTaskId', taskId: taskId}));
			setInterval(sendStatToMonitor, config.timeouts.sendStatToMonitor);
		}

		// пытаемся стать генератором 
		tryToCaptureGeneratorFlag();
	}
}


/**
 * Попытка захвата флага генератора
 */ 
function tryToCaptureGeneratorFlag(){
	client.set('generatorIsActive', '1', 'NX', 'EX', config.timeouts.refreshGeneratorIsActiveFlag * 2, tryToCaptureGeneratorFlag_cb);
}


/**
 * Колбек попытки захвата флага генератора
 */ 
function tryToCaptureGeneratorFlag_cb(err,data){
	if (data == 'OK'){
		// переключаемся в режим генератора
		switchToGeneratorMode();

	} else {
		// переходим к запросу сообщений для обработки
		requestMessage();
	}
}


/**
 * Переключение в режиме генератора
 */ 
function  switchToGeneratorMode(){
	// на всякий случай отправим в monitor самые свежие данные по работе в режиме обработчика 
	if (monitored){
		sendStatToMonitor();
	}
	
	isGenerator = true;
	
	// обновление флага
	refreshGeneratorFlag();
	
	// генерация сообщения
	generateMessage();
		
	// если запущено через монитор, сообщаем ему о том, что стали генератором
	if (monitored){
		console.log(JSON.stringify({msg: 'switchedToGeneratorMode'}));
	}
	
}

/**
 * Обновление флага генератора
 */  
function refreshGeneratorFlag(){
	client.set('generatorIsActive', '1', 'EX', config.timeouts.refreshGeneratorIsActiveFlag * 2, refreshGeneratorFlag_cb);
}

/**
 * Колбек обновления флага генератора
 */  
function refreshGeneratorFlag_cb(){
	setTimeout(refreshGeneratorFlag, config.timeouts.refreshGeneratorIsActiveFlag);
}


/**
 * Генерация сообщения
 */  
function generateMessage(){
	client.rpush('messages', getMessage(), generateMessage_cb);
}

/**
 * Колбек генерации сообщения
 */  
function generateMessage_cb(err, data){
	if (err === null){
		generated.total++;
		setTimeout(generateMessage, config.timeouts.generateMessage);
	}
}

/**
 * Формирование сообщения
 */
function getMessage(){
 cnt = cnt || 0;
 return cnt++;
}


/**
 * Отправка статистики работы в monitor
 */ 
function sendStatToMonitor(){
	if (isGenerator){
		console.log(JSON.stringify({msg: 'generated', total: generated.total}));
	} else {
		console.log(JSON.stringify({msg: 'processed', total: processed.total, errors: processed.errors}));
	}
}


/**
 * Запрос сообщения (в режиме обработчика)
 */ 
function requestMessage(){
	// быстрый или обычный таймаут? примерно 20% вероятность быстрого таймаута, чтобы оперативнее реагировать на потерю генератора
	var tm = (Math.round(Math.random()*10) < 2) ? 1 : 10;
	client.blpop('messages', tm, requestMessage_cb);
}

/**
 * Колбек запроса сообщения
 */ 
function requestMessage_cb(err,data){
	if (data !== null){
		processMessage(data[1], processMessage_cb);		
	}
	// попробовать стать генератором или нет? примерно 20% вероятность
	if (Math.round(Math.random()*10) < 2) {
		tryToCaptureGeneratorFlag();	
	} else {
		requestMessage();
	}
}

/**
 * Обработка сообщения
 */ 
function processMessage(msg, callback){
	
	function onComplete(){
		var error = Math.random() > 0.85;
		callback(error, msg);
	}

	// processing takes time...
	setTimeout(onComplete, Math.floor(Math.random()*1000));	
}

/**
 * Колбек обработки сообщения
 */ 
function processMessage_cb(err, msg){
	processed.total++;
	if (err){
		processed.errors++;
		client.rpush('errors', msg);
	}
}


/**
 * Запрос всех ошибок 
 */ 

function getErrorsAndDie(){
	client.multi()
		.lrange('errors', 0, -1)
		.del('errors')
		.exec(getErrorsAndDie_cb);
}

/**
 * Колбек запроса всех ошибок 
 */ 
function getErrorsAndDie_cb(err, data){
	console.log(data[0]);
	client.quit();
}