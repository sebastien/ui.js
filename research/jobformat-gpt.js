// Helper function to generate random integer within a range
function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper function to select a random element from an array
function getRandomElement(arr) {
	return arr[getRandomInt(0, arr.length - 1)];
}

// Sample data for job names, log messages, action reasons, etc.
const sampleData = {
	jobNames: [
		"backup-files",
		"data-ingestion",
		"report-generation",
		"data-validation",
	],
	logMessages: [
		"File not found",
		"Permission denied",
		"Database connection error",
		"Invalid input data",
	],
	actionReasons: [
		"Retry operation",
		"Notify admin",
		"Abort operation",
		"Recover data",
	],
};

// Function to create a period object
function createPeriod() {
	return {
		weekdays: {
			1: getRandomInt(0, 1),
			2: getRandomInt(0, 1),
			3: getRandomInt(0, 1),
			4: getRandomInt(0, 1),
			5: getRandomInt(0, 1),
			6: getRandomInt(0, 1),
			7: getRandomInt(0, 1),
		},
		day: { "*": getRandomInt(0, 1) },
		month: { "*": getRandomInt(0, 1) },
		hour: { "*": getRandomInt(0, 1) },
		minute: { "*": getRandomInt(0, 1) },
		second: { "*": getRandomInt(0, 1) },
	};
}

// Function to create a schedule object
function createSchedule() {
	return {
		job: getRandomElement(sampleData.jobNames),
		arguments: {},
		duration: getRandomInt(600, 3600), // Duration between 10 minutes to 1 hour
		timeout: getRandomInt(1800, 7200), // Timeout between 30 minutes to 2 hours
		schedule: createPeriod(),
		depends: [],
		concurrency: getRandomInt(1, 5),
		retries: getRandomInt(1, 10),
	};
}

// Function to create a log entry object
function createLog() {
	return {
		type: getRandomElement(["log", "warning", "error"]),
		name: getRandomElement(["NOENT", "PERMDENIED", "DBCONNECTION"]),
		origin: "app.component.function",
		message: getRandomElement(sampleData.logMessages),
		data: { user: "username123" },
		context: {
			Trace: getRandomInt(100000, 999999),
			Environment: "development",
			Host: "example.com",
			Port: 8080,
		},
	};
}

// Function to create an action object
function createAction() {
	return {
		code: "app.service.operation",
		arguments: {},
		origin: "app.component.function",
		reason: getRandomElement(sampleData.actionReasons),
	};
}

// Function to create a job object
function createJob() {
	const now = Math.floor(Date.now() / 1000);
	return {
		name: getRandomElement(sampleData.jobNames),
		status: getRandomElement(["running", "succeeded", "failed"]),
		duration: getRandomInt(10, 3600), // Duration between 10 seconds to 1 hour
		retries: getRandomInt(0, 5),
		scheduled: now,
		started: now - getRandomInt(1, 3600), // Started within past 1 hour
		ended: now - getRandomInt(1, 3600), // Ended within past 1 hour
		error: [createLog(), createLog()], // Sample error logs
		warning: [createLog()], // Sample warning logs
		actions: [createAction(), createAction()], // Sample actions
	};
}

function createJobsSchedule() {
	const numJobs = getRandomInt(5, 10);
	const jobs = [];

	for (let i = 0; i < numJobs; i++) {
		const job = createJob();
		job.schedule = createPeriod(); // Generate schedule for each job
		jobs.push(job);
	}

	return jobs;
}

function createJobsRun(schedule) {
	const jobsRun = [];
	const startTime = Math.floor(Date.now() / 1000) - 86400; // 24 hours ago

	schedule.forEach((job) => {
		const numRuns = getRandomInt(5, 10); // Simulate multiple runs for each job
		const retries = job.retries > 0 ? job.retries : 1; // Ensure at least 1 retry

		for (let i = 0; i < numRuns; i++) {
			const scheduledTime = startTime + getRandomInt(0, 86400); // Random time within the past 24 hours
			const jobRun = {
				...createJob(),
				name: job.name,
				retries: retries,
				scheduled: scheduledTime,
				started: scheduledTime + getRandomInt(1, 3600), // Started within 1 hour after scheduled time
				ended: scheduledTime + getRandomInt(3600, 7200), // Ended within 1-2 hours after scheduled time
				status: getRandomElement(["succeeded", "failed"]), // Randomly assign job status
			};

			if (jobRun.status === "failed") {
				// If job failed, add retries with consistent data
				for (let j = 0; j < retries; j++) {
					const retryTime = jobRun.ended + getRandomInt(3600, 7200); // Retry 1-2 hours after previous end time
					const retryJob = {
						...jobRun,
						scheduled: retryTime,
						started: retryTime + getRandomInt(1, 3600), // Started within 1 hour after retry scheduled time
						ended: retryTime + getRandomInt(3600, 7200), // Ended within 1-2 hours after retry scheduled time
						retries: retries - j - 1, // Decrease remaining retries for each retry attempt
					};
					jobsRun.push(retryJob);
				}
			}

			jobsRun.push(jobRun);
		}
	});

	return jobsRun;
}

const send = (data) => {
	const headers = {
		"Content-Type": "application/json",
		"Access-Control-Allow-Methods":
			"GET, POST, OPTIONS, HEAD, INFO, PUT, DELETE, UPDATE",
		"Access-Control-Allow-Origin": "*",
	};

	return new Response(JSON.stringify(data), { headers });
};

// Example usage:
const schedule = createJobsSchedule();
const run = createJobsRun(schedule);
console.log({ schedule, run });
