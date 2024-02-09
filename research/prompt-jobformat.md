Your goal is to produce sample data in JSON that represents multiple jobs
running for an application. These job are typically run on schedule, and
may fail and need to be re-run.

First, let's go over the data format.

Schedule format:
- job: the name of the job, must match the job format name
- arguments: the arguments to the job as a JSON dict
- duration: the expected duration of the job in seconds
- timeout: the timeout of the job
- schedule: a period value (see period)
- depends: a list of other jobs it depends on
- concurrency: the number of maximum concurrent processes (1 usually)
- retries: the maximum number of retries (typically 5)

For instance:

```
{
    "job": "backup-files",
    "arguments": {},
    "duration": 1800,
    "timeout": 3600,
    "schedule": {
        "weekday": {
            "1": 1,
            "2": 1,
            "3": 1,
            "4": 1,
            "5": 1,
            "6": 0,
            "7": 0
        }
    },
    "retries": 1
}
```

Period format: each field is a mapping, the `*` entry in the mapping means
for every value. The frequency in the mapping

- weekday: a mapping of the weekday (1=MON, 7=SUN) to a frequency (see below)
- day: a mapping of the day number to a frequency
- month: a mapping of the month number to a frequency (1=JAN, 12=DEC) (1=JAN, 12=DEC) (1=JAN, 12=DEC) (1=JAN, 12=DEC)
- hour: a mapping of the hour to a frequency
- minute: a mapping of the minute to a frequency
- second: a mapping of the minute to a frequency

For instance, every week at 10:00AM

```
{
"weekdays": { "1": 1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 0, "7": 0 },
"hour": {"10":1}
}
```

or every 5 minutes

```
{"minute":{"*":[1,5]}}
```


Job format:
- name: the name of the job, for instance `ingestion-documents-website`, `validation-transaction-integrity`
- status: running, succeeded, failed.
- duration: the duration of the job, in seconds as a float
- retries: the number of retries before that job, 0 means it's the first run
- scheduled: an EPOCH timestamp in seconds representing when the job was scheduled
- started: an EPOCH timestamp in seconds, representing when the job was started
- ended: an EPOCH timestamp in seconds, representing when the job was ended
- error: a list of errors that may have happened, in the log format (see below)
- warning: a list of warnings that may have happened, also in log format
- actions:  a list of action that may need to be taken, see action format

Log format:
- type: either log, warning, error
- name: optionally the name or code for the log entry, such as the error code, eg `NOENT`
- origin: the source of the log, typically the name of the program,procedure or function, eg `app.component.function`.
- message: a human readable message describing the error
- data: some JSON object containing the data that is erroneous, for instance `{user:"&aqwe123^"}` for a "Invalid username" message
- context: indicates where the error originates from, like `{User:"jsmith", Trace:1231312}`

Some common context attributes are:
- Trace: a unique trace identifier
- Environment: the environment this runs in, eg `development`
- Host: the hostname on which the application runs
- Port: the port on which the operation was performed (if networked)

Action format:
- code: the machine code for the action, typically like `app.service.operation` where
- arguments: the arguments as a JSON dictionary
- origin: the source of the action, like the origin of the log format
- reason: human readable of what the action does

Now it's time to generate sample data, follow this process:

- Define a list of a dozen jobs that are representative of what a server
  side web application would do (backups, synthetic tests, ingestion, cleanup, etc)

- For each of these job, define a schedule (see Schedule format) that would make
  sense for an application (synthetic tests every 5 minute, hourly backups, EOD
  cleanups, etc).

- Output the sample schedule using the Schedule format. I will then resume then
   process with further instruction.

--

- Great, now simulate a day's worth of going through that schedule. Some jobs will
  work fine, some jobs will fail and will report errors, some will need to
  be retried.

- For each job that has warning or errors, you'll need to generate log entries
  in the Log Format defined previously. Make sure that the warnings are
  and errors are representative of the job. In case the jobs has errors
  and has exhausted the maximum number of retries, you should include some
  actions, which could be to send a notification or to perform a corrective
  job.


--

This is great, now can you write me a Python script that generates sample data
by doing the following:

- Define NamedTuple subclasses with type annotation for each of the data formats
  I mentioned (Schedule, Period, Job, Log, Action)

- Define `createSchedule()`, `createPeriod()`, `createJob()`, `createLog()`,
  `createAction()` functions that take keyword arguments matching the properties
  of the named tuples, but generating random plausible values if the values
  are not provided.

-

This is good, now let's write a `createJobRun()` function that uses the above
to generate a plausible job run.

