/*
 * @Description: 
 * @Author: dingxuejin
 * @Date: 2021-02-08 20:38:14
 * @LastEditTime: 2021-02-08 20:47:14
 * @LastEditors: dingxuejin
 */
const shell = require("shelljs");
const archiver = require("archiver");
const { NodeSSH } = require("node-ssh");
const projectDir = process.cwd();
const fs = require("fs");

let ssh = new NodeSSH();

async function deploy(config) {
    if (!config) {
        process.exit(1)
    }
    await build();
    await startZip(config);
    await connectSSH(config);
    await delFile(config);
    await uploadFile(config);
    await unzipFile(config);
    await searchCon(config);
}

//步骤一,打包
async function build() {
    try {
        await shell.exec("npm run build");
    } catch (error) {
        console.log("打包失败:" + error);
        process.exit(1);
    }
}

//步骤二,压缩文件
async function startZip(config) {
    let { zipPath } = config;
    return new Promise((resolve, reject) => {
        console.log("（2）打包成zip");
        const archive = archiver("zip", {
            zlib: { level: 9 },
        }).on("error", (err) => {
            throw err;
        });
        const output = fs.createWriteStream(`${projectDir}/${zipPath}.zip`);
        output.on("close", (err) => {
            if (err) {
                console.log(`  关闭archiver异常 ${err}`);
                reject(err);
                process.exit(1);
            }
            console.log("zip打包成功");
            resolve();
        });
        archive.pipe(output);
        archive.directory(zipPath, false);
        archive.finalize();
    });
}

//步骤三,连接服务器
async function connectSSH(config) {
    const { host, port, username, password, privateKey, passphrase } = config;
    const sshConfig = {
        host,
        port,
        username,
        password,
    };
    try {
        console.log(`连接${host}`);
        await ssh.connect(sshConfig);
        console.log("SSH连接成功");
    } catch (err) {
        console.log(`连接失败 ${err}`);
        process.exit(1);
    }
}

//步骤四,删除目录
async function delFile(config) {
    const { webDir } = config;
    try {
        console.log("删除文件");
        await runCommand(`rm -rf ${webDir}/`, "/");
        console.log("删除文件成功");
    } catch (err) {
        console.log(`删除文件失败${err}`);
        process.exit(1);
    }
}

//步骤五,上传目录
async function uploadFile(config) {
    const { webDir, zipPath } = config;
    try {
        console.log(`上传zip至目录${webDir}`);
        await ssh.putFile(
            `${projectDir}/${zipPath}.zip`,
            `${webDir}/${zipPath}.zip`
        );
        console.log("zip包上传成功");
    } catch (err) {
        console.log(`zip包上传失败 ${err}`);
        process.exit(1);
    }
}

async function runCommand(command, webDir) {
    await ssh.execCommand(command, { cwd: webDir });
}

//步骤六,解压文件
async function unzipFile(config) {
    const { webDir, zipPath } = config;
    try {
        console.log("（5）开始解压zip包");
        await runCommand(`cd ${webDir}`, webDir);
        await runCommand(`unzip -o ${zipPath}.zip && rm -f ${zipPath}.zip`, webDir);
        console.log("  zip包解压成功");
    } catch (err) {
        console.log(`  zip包解压失败 ${err}`);
        process.exit(1);
    }
}

//步骤七,查找容器
async function searchCon(config) {
    const { webDir, containName } = config;
    try {
        console.log("查找容器");
        let result = await ssh.execCommand(`docker ps -q -f name=${containName}`, {
            cwd: webDir,
        });
        console.log(result.stdout);

        if (result.stdout) {
            console.log("发现容器");
            //重新启动容器
            await restartCon(config);
            process.exit(0);
        } else {
            console.log("创建容器");
            //创建容器
            await creatCon(config);
            process.exit(0);
        }
    } catch (err) {
        console.log(`查找容器命令运行错误---${err}`);
        process.exit(1);
    }
}

//步骤八,重新启动容器
async function restartCon(config) {
    const { webDir, containName } = config;
    try {
        console.log("重启容器");
        await runCommand(`docker restart ${containName}`, webDir);
        console.log("重启容器成功");
    } catch (err) {
        console.log(`重启容器失败:${err}`);
        process.exit(1);
    }
}

//步骤八,创建新容器
async function creatCon(config) {
    const { webDir, webRootDir, containName } = config;
    const command = `docker run --name ${containName} -d -p 8090:80 -v ${webDir}:/usr/share/nginx/html -v ${webRootDir}/conf/nginx.conf:/etc/nginx/nginx.conf -v ${webRootDir}/conf.d:/etc/nginx/conf.d -v ${webRootDir}/logs:/var/log/nginx nginx`;
    try {
        console.log("创建容器");
        await runCommand(command, webDir);
        console.log("创建容器成功");
    } catch (err) {
        console.log(`创建容器失败:${err}`);
        process.exit(1);
    }
}

module.exports = deploy;