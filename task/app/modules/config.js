module.exports = {
	db: {
		host: '127.0.0.1',
		port: '6379',
		pass: 'mypass'	// если не установлен или пуст - авторизация не выполняется
	},
	timeouts: {
		refreshGeneratorIsActiveFlag: 2,	// таймаут_обновления_флага_активности_генератора (сек)
		generateMessage: 500, // таймаут_генерации_сообщения (мсек)
		sendStatToMonitor: 500, // таймаут_отправки_статистики_в_монитор (мсек)
	}
}
