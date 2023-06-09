FROM amazon/aws-lambda-nodejs:16

RUN yum -y install git

WORKDIR ${LAMBDA_TASK_ROOT}
# Get all submodules
RUN git clone --recurse-submodules https://github.com/zotero/pdf-worker.git
# Innstall dependencies
COPY package*.json ./
RUN npm install
# Build the pdf-worker
RUN cd pdf-worker && npm run build
# Copy the main function code
COPY src/ ./src
# Copy config
COPY config/ ./config

CMD [ "src/main.main" ]