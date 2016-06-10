module.exports = {
	tasks: 16, // количество запускаемых заданий
	child: {
		cmd: 'node', 
		args: ['./../../task/app/app.js', 'monitored']
	}
}
