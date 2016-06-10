/// <reference path="./../typings/node/node.d.ts" />
'use strict';

var 
	spawn = require('child_process').spawn,
	ansi = require('ansi-escape-sequences'),
	util = require('util'),
	fs = require('fs'),
	config = require("./modules/config.js");


var 
	tasks = [];	// массив запущенных заданий


process.chdir(__dirname);
process.stdin.setRawMode(true);

process.stdin.on('data', function (data) {
  switch (data.toString()){
		case 'k': killCurrentGenerator(); break;
		case 'q': console.log(ansi.cursor.show); process.exit(); break;
	}
});

console.log(ansi.cursor.hide);

//var logDir =  './logs/' + Date.now() + '-' + process.pid; fs.mkdirSync(logDir);

// переделать на отправку сообщения?
function killCurrentGenerator(){
	for (var i in tasks){
		if (tasks[i].isGenerator && !tasks[i].killed){
			tasks[i].process.kill('SIGINT');
		}
	}
}

// вспомогательная функция для форматирования
var padTo = function(val, num, fromRight){
	var str = val.toString();
	if (num <= str.length){return str;}
	var pad = "";
	for (var i = 0; i < (num - str.length); i++){pad += ' ';}
	return ((fromRight) ? (str + pad) : (pad + str))
}


// устанавливаем информацию (taskId, флаг завершения процесса, статистику работы и т.п.)
function getTaskIndexByPid(pid){
	for (var i in tasks){
		if (tasks[i].process.pid == pid){
			return i;
		}
	}	
}

for (var i = 0; i < config.tasks; i++){
    var p = spawn(config.child.cmd, config.child.args);
		
		(function (p){
			
			// обработчик сообщений от задания монитору
			p.stdout.on('data', function(data) {
				try {
					//fs.appendFile(logDir + '/' + p.pid, data);
          //fs.appendFile(logDir + '/' + p.pid, '\n----\n');

					var i = getTaskIndexByPid(p.pid);
					var lines = data.toString().split('\n');
					for (var j = 0; j < lines.length; j++){
						if (!lines[j].length){continue;}
						var msg = JSON.parse(lines[j]);
						switch (msg.msg){
							case 'createdTaskId': tasks[i].taskId = msg.taskId; break;
							case 'switchedToGeneratorMode': tasks[i].isGenerator = true; break;
							case 'generated': tasks[i].generated.total = msg.total; break;
							case 'processed': 
								tasks[i].processed.total = msg.total; 
								tasks[i].processed.errors = msg.errors;
								break;
						}
					}	
				} catch (err){
					//fs.appendFile(logDir + '/' + p.pid, '\n' + err + '\n');					
				}
			});

			// обработчик завершения процесса задания
			p.on('exit', function(code) {
				tasks[getTaskIndexByPid(p.pid)].killed = true;
			});
			
		})(p);
		
	tasks.push({
		process: p,
		taskId: '',
		isGenerator: false,
		generated: {total: 0},
		processed: {total: 0, errors: 0},
		killed: false,
		inputBuffer: ''
	});
	
}

console.log(ansi.style.yellow + util.format('Starting %s tasks. Press [k] to kill generator, [q] to quit monitor (killing all tasks).', config.tasks) + ansi.style.reset);

output(true);

function output(firstCall) {

	if (!firstCall){
		console.log(ansi.cursor.up(tasks.length*2 + 4));
	}

	var obuf = [];
	var tr = '+--------+------------+--------+------------+----------------+----------------+----------------+';
	
	obuf.push(tr);
	obuf.push(util.format('|%s|%s|%s|%s|%s|%s|%s|',  
		padTo('pid', 8), 
		padTo('taskId', 12), 
		padTo('killed?', 8),
		padTo('generator?', 12),
		padTo('gen.total', 16),
		padTo('proc.total', 16),
		padTo('proc.errors', 16)
	));
	
	for (var i = 0; i < tasks.length; i++) {
		var task = tasks[i];
		obuf.push(tr);
		obuf.push(util.format('|%s|%s|%s|%s|%s|%s|%s|', 
			padTo(task.process.pid, 8), 
			padTo(task.taskId, 12), 
			((task.killed) ? (ansi.style.red + padTo('yes', 8) + ansi.style.reset) : (padTo(' ', 8))),
			((task.isGenerator) ? (
				((!task.killed) ? (ansi.style.green) : (ansi.style.red)) + 
				padTo(((!task.killed) ? 'yes' : 'was'), 12) + 
				ansi.style.reset) : (padTo(' ', 12))),
			padTo(task.generated.total, 16),	
			padTo(task.processed.total, 16),
			padTo(task.processed.errors, 16)
		));
	}
	
	obuf.push(tr);
	
	console.log(obuf.join('\n'));

	setTimeout(output, 500);

}
