const data = {
	jobNames: [
		"backup",
		"data-processing",
		"report-generation",
		"validation",
		"cleanup",
	],
	logTypes: ["log", "warning", "error"],
	errorCodes: ["ENOENT", "EPERM", "EIO", "EINVAL"],
	origins: ["scheduler", "job-runner", "network", "database"],
	logMessages: [
		"File not found",
		"Insufficient permissions",
		"I/O error",
		"Invalid data format",
		"Task timed out",
	],
	actionCodes: ["notify-admin", "restart-job", "run-cleanup", "rollback"],
	jobStatuses: ["running", "succeeded", "failed"],
};

function getRandomItem(array) {
	return array[Math.floor(Math.random() * array.length)];
}

function createJobName() {
	return `${getRandomItem(data.jobNames)}-${Math.floor(
		Math.random() * 1000
	)}`;
}

function createLogEntryMessage() {
	return getRandomItem(data.logMessages);
}

function createPeriod() {
	const period = {
		weekday: {},
		day: {},
		month: {},
		hour: {},
		minute: {},
		second: {},
	};

	// (Fill in logic to randomly populate period fields based on frequency mappings)

	return period;
}

function createSchedule() {
	return {
		job: createJobName(),
		arguments: {
			// Add some sample arguments here
		},
		duration: Math.floor(Math.random() * 3600) + 60, // 1 minute minimum
		timeout: Math.floor(Math.random() * 7200) + 3600, // 1 hour minimum
		schedule: createPeriod(),
		depends: [], // Potentially generate dependencies
		concurrency: 1,
		retries: Math.floor(Math.random() * 5), // Up to 5 retries
	};
}

function createJobRun() {
	return {
		name: createJobName(),
		status: getRandomItem(data.jobStatuses),
		duration: Math.random() * 3600, // Up to an hour
		retries: 0,
		scheduled: Math.floor(Date.now() / 1000), // Current timestamp in seconds
		started: null, // Set when job starts
		ended: null, // Set when job ends
		error: [],
		warning: [],
		actions: [],
	};
}

function createLogEntry() {
	return {
		type: getRandomItem(data.logTypes),
		name: getRandomItem(data.errorCodes), // Optional
		origin: getRandomItem(data.origins),
		message: createLogEntryMessage(),
		data: null, // Optional
		context: {}, // Consider adding context attributes
	};
}

function createAction() {
	return {
		code: getRandomItem(data.actionCodes),
		arguments: {}, // Add sample arguments as needed
		origin: getRandomItem(data.origins),
		reason: null, // Optionally add a reason
	};
}

function createPeriod(
	weekdayProb = 0.5,
	dayProb = 0.2,
	monthProb = 0.3,
	hourProb = 0.4,
	minuteProb = 0.6,
	secondProb = 0.8
) {
	const period = {
		weekday: {},
		day: {},
		month: {},
		hour: {},
		minute: {},
		second: {},
	};

	// Populate weekdays
	for (let i = 1; i <= 7; i++) {
		period.weekday[i] = Math.random() < weekdayProb ? 1 : 0;
	}

	// Populate days
	for (let i = 1; i <= 31; i++) {
		let frequency = Math.random();
		if (frequency < dayProb) {
			period.day[i] = 1;
		} else if (frequency < dayProb * 1.5) {
			period.day[i] = Math.floor(Math.random() * 5) + 1; // Run up to 5 times
		} else {
			period.day[1] = 0;
		}
	}

	// Populate months (add logic for month with varying days if needed)
	for (let i = 1; i <= 12; i++) {
		period.month[i] = Math.random() < monthProb ? 1 : 0;
	}

	// Populate hours
	for (let i = 0; i <= 23; i++) {
		let frequency = Math.random();
		if (i >= 9 && i <= 17) {
			period.hour[i] = frequency < hourProb * 1.5 ? 1 : 0;
		} else {
			period.hour[i] = frequency < hourProb * 0.5 ? 1 : 0;
		}
	}

	// Populate minutes
	for (let i = 0; i <= 59; i++) {
		let frequency = Math.random();
		if (i % 15 === 0) {
			period.minute[i] = frequency < minuteProb * 1.2 ? 1 : 0;
		} else {
			period.minute[i] = frequency < minuteProb ? 1 : 0;
		}
	}

	// Populate seconds (similar logic to minutes)
	for (let i = 0; i <= 59; i++) {
		period.second[i] = Math.random() < secondProb ? 1 : 0;
	}

	return period;
}

console.log(createSchedule());
