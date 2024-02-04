const getRandomElement = (array) =>
	array[Math.floor(Math.random() * array.length)];
function generateLog() {
	const types = ["log", "warning", "error"];
	const messages = [
		"Operation successful",
		"Invalid input format",
		"File not found",
		"Data saved successfully",
		"Incomplete configuration",
		"Network connection lost",
		"User logged in",
		"Invalid authentication token",
		"Data retrieved successfully",
		"Invalid configuration value",
		"Task completed",
		"Database connection failed",
		"Email sent successfully",
		"Invalid input parameter",
		"Image processed successfully",
		"Permission denied",
		"Payment received",
		"Invalid configuration key",
		"Request processed successfully",
		"Critical system error",
		"Unexpected behavior detected",
		"Security breach detected",
		"Resource exhausted",
		"Unexpected timeout",
	];

	const origins = [
		"App.main",
		"Utils.validateInput",
		"FileHandler.readFile",
		"Database.saveRecord",
		"ConfigValidator.validate",
		"ApiClient.sendRequest",
		"AuthService.login",
		"AuthValidator.validateToken",
		"DataFetcher.fetchData",
		"ConfigManager.validateConfig",
		"TaskExecutor.executeTask",
		"DatabaseConnector.connect",
		"EmailSender.sendEmail",
		"OrderProcessor.processOrder",
		"ImageProcessor.processImage",
		"SecurityManager.checkPermission",
		"PaymentProcessor.processPayment",
		"ConfigValidator.validateKey",
		"ApiHandler.handleRequest",
		"SystemMonitor.monitor",
		"EventLogger.logEvent",
		"NotificationService.sendNotification",
		"UserManager.updateUser",
		"AnalyticsTracker.trackEvent",
	];

	const logEntry = {
		type: getRandomElement(types),
		message: getRandomElement(messages),
		data: generateRandomData(),
		context: {
			origin: getRandomElement(origins),
			trace: Math.floor(Math.random() * 1000000),
		},
	};

	return logEntry;
}

function generateRandomData(limit = 3, depth = 0) {
	const dataTypes = [
		"string",
		"number",
		"boolean",
		"object",
		"array",
		"null",
	];
	const randomDataType = getRandomElement(dataTypes);

	switch (randomDataType) {
		case "string":
			return getRandomString();
		case "number":
			return Math.random() * 100; // Replace with your own logic for generating random numbers
		case "boolean":
			return Math.random() > 0.5;
		case "object":
			return depth >= limit ? {} : generateRandomObject(depth + 1, limit);
		case "array":
			return depth >= limit ? {} : generateRandomArray(depth + 1, limit);
		case "null":
			return null;
		default:
			return null;
	}
}

function getRandomString() {
	const characters =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const length = Math.floor(Math.random() * 10) + 1; // Random string length between 1 and 10 characters
	let result = "";

	for (let i = 0; i < length; i++) {
		result += characters.charAt(
			Math.floor(Math.random() * characters.length)
		);
	}

	return result;
}

function generateRandomObject(limit = 3, depth = 0) {
	const object = {};
	const keys = ["name", "age", "city", "email", "isActive", "createdAt"];

	for (const key of keys) {
		object[key] = generateRandomData(limit, depth + 1);
	}

	return object;
}

function generateRandomArray(limit = 3, depth = 0) {
	const array = [];
	const length = Math.floor(Math.random() * 5) + 1; // Random array length between 1 and 5

	for (let i = 0; i < length; i++) {
		array.push(generateRandomData(limit, depth + 1));
	}

	return array;
}

// Example usage
const res = [];
for (let i = 0; i < 200; i++) {
	res.push(generateLog());
}
console.log(JSON.stringify(res));
