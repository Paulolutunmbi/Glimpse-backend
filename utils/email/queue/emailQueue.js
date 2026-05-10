const sendImmediately = async (job) => job.send();

let enqueueEmailJob = sendImmediately;

const setEmailQueueAdapter = (adapter) => {
  enqueueEmailJob = typeof adapter === 'function' ? adapter : sendImmediately;
};

const dispatchEmailJob = async (job) => enqueueEmailJob(job);

module.exports = {
  dispatchEmailJob,
  setEmailQueueAdapter,
};
