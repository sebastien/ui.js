Your goal is to produce a JavaScript program that can synthesise (generate)
random data simulating a job scheduler and the running of jobs.

First, let's go over the key concepts:

- A job is a process that is run on a schedule. This process may succeed or
  fail, produce errors or warnings, and potentially produce actions to be
  performed as a result of the job's status. Errors and warnings are captured as Log Entries,
  while actions have their own format.

- A job schedule is the definition of when and how often a job should be run. To
  do so we map frequencies to specific time moments (weekdays, months, hours, etc).

Now let's get into the specific formats.

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

Job run format:
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



Now, I'd like you to start by defining `createSchedule()`, `createPeriod()`,
`createJob()`, `createLog()`, `createAction()` with the following requirements:

- Each generate a new unique random value of each type.
- Each use helper functions to generate sample data, such as `createJobName()`,
  `createLogEntryMessage()`, etc.
- Functions that generate text should draw from a global object that defines
  elements (typically words or sentences) that can be combined to synthesise
  the data.

Now, please write the JavaScript code, and make sure that:
- You are not missing any element
- You are not missing any field
- You generate data for every single fields
- Not that sometimes you can generate `null` or empty (`[]`) data, but it
  should be explicit.


--

Now that we have these primitives in place, can you write a function

- createJobsSchedule() that creates a schedule representative of the jobs
  that would run for an applications, such as backups, synthetics tests,
  cleanups, EOD processes, etc.

When doing so,  make sure that:

- You do not hardcode the categories of jobs or any other value, you
  should generate these so that each run gives different results.
- You are not missing any element
- You are not missing any field
- You generate data for every single fields
- Not that sometimes you can generate `null` or empty (`[]`) data, but it
  should be explicit.

Please just give the code without a breakdown or explanation. If you feel
you need to clarify, you can use comments.


--

Now let's write a function `createJobsRun(schedule)` that takes a schedule
and creates corresponding Job run entries. A good way to do that would
be to use `createJob` and then override with specific values that need
to be consistent, like the job name, time and number of retries. For
instance `{...createJob(), name:"my-job-"name"}`.

Make sure that:
- Some of your jobs fail and are retried from time to timeout
- Make sure that retried jobs have consistent data (time, name, number or retries)
- You simulate a run over a whole day, so you should have quite a few entries
  there based on the schedule.

