import { Construct } from "constructs";
import { App, Chart, ChartProps, Duration, Size } from "cdk8s";
import 'dotenv/config'
import {
  ConfigMap,
  Cpu,
  Deployment,
  EnvFrom,
  Job,
  Namespace,
  PersistentVolumeAccessMode,
  PersistentVolumeClaim,
  Secret,
  Service,
  ServiceType,
  StatefulSet,
  Volume,
} from "cdk8s-plus-27";

export class MyChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    new Namespace(this, "bigcapital", { metadata: { name: "bigcapital" } });

    const namespace = "bigcapital";

    const mariadbConfigMap = new ConfigMap(this, "mariadb-configmap", {
      metadata: {
        namespace,
      },
      data: {
        MARIADB_DATABASE: "bigcaptial",
        MARIADB_USER: "bigcapital",
        MARIADB_PASSWORD: "bigcapital",
        MARIADB_RANDOM_ROOT_PASSWORD: "yes",
      },
    });

    const secrets = new Secret(this, "secrets", {
      stringData: {
        MAIL_USERNAME: process.env.MAIL_USERNAME!,
        MAIL_PASSWORD: process.env.MAIL_PASSWORD!,

        JWT_SECRET: process.env.JWT_SECRET!,
      }
    })

    const serverConfigMap = new ConfigMap(this, "server-configmap", {
      metadata: { namespace },
      data: {
        MAIL_HOST: "email-smtp.ap-southeast-2.amazonaws.com",        
        MAIL_PORT: "465",
        MAIL_SECURE: "true",
        MAIL_FROM_NAME: "BigCapital",
        MAIL_FROM_ADDRESS: "bigcapital@kochie.io",

        MONGODB_DATABASE_URL:
          "mongodb://mongodb.bigcapital.svc.cluster.local/bigcapital",

        DB_HOST: "mariadb.bigcapital.svc.cluster.local",
        DB_USER: "bigcapital",
        DB_PASSWORD: "bigcapital",
        DB_CHARSET: "utf8",

        SYSTEM_DB_NAME: "bigcapital_system",

        TENANT_DB_NAME_PERFIX: "bigcapital_tenant_",

        BASE_URL: "bigcapital.kochie.io",

        AGENDASH_AUTH_USER: "agendash",
        AGENDASH_AUTH_PASSWORD: "123123",

        SIGNUP_DISABLED: "false",
        SIGNUP_ALLOWED_DOMAINS: "",
        SIGNUP_ALLOWED_EMAILS: "",
      },
    });

    const mongoVolumeClaim = new PersistentVolumeClaim(
      this,
      "mongo-volume-claim",
      {
        accessModes: [PersistentVolumeAccessMode.READ_WRITE_MANY],
        storage: Size.gibibytes(10),
        storageClassName: "longhorn-single",
        metadata: {
          namespace,
        },
      }
    );
    const mongoVolume = Volume.fromPersistentVolumeClaim(
      this,
      "mongo-volume",
      mongoVolumeClaim
    );

    const redisVolumeClaim = new PersistentVolumeClaim(
      this,
      "redis-volume-claim",
      {
        accessModes: [PersistentVolumeAccessMode.READ_WRITE_MANY],
        storage: Size.gibibytes(10),
        storageClassName: "longhorn-single",
        metadata: {
          namespace,
        },
      }
    );
    const redisVolume = Volume.fromPersistentVolumeClaim(
      this,
      "redis-volume",
      redisVolumeClaim
    );

    const mariadbVolumeClaim = new PersistentVolumeClaim(
      this,
      "mariadb-volume-claim",
      {
        accessModes: [PersistentVolumeAccessMode.READ_WRITE_MANY],
        storage: Size.gibibytes(10),
        storageClassName: "longhorn-single",
        metadata: {
          namespace,
        },
      }
    );
    const mariadbVolume = Volume.fromPersistentVolumeClaim(
      this,
      "mariadb-volume",
      mariadbVolumeClaim
    );

    new StatefulSet(this, "mongodb", {
      metadata: {
        namespace,
        name: "mongodb",
      },

      service: new Service(this, "mongodb-svc", {
        ports: [{ port: 27017, targetPort: 27017, name: "mongodb" }],
        type: ServiceType.CLUSTER_IP,
        metadata: {
          name: "mongodb",
          namespace,
        },
      }),

      replicas: 1,
      terminationGracePeriod: Duration.seconds(10),
      containers: [
        {
          name: "mongodb",
          image: "mongo:4.4.6",
          securityContext: {
            readOnlyRootFilesystem: false,
            ensureNonRoot: false,
          },
          // command: ["mongod", "--replSet", "rs0"],
          ports: [{ number: 27017, name: "mongodb" }],
          volumeMounts: [{ path: "/data/db", volume: mongoVolume }],
          resources: {
            cpu: {
              limit: Cpu.millis(512),
            },
            memory: {
              limit: Size.mebibytes(256),
            },
          },
        },
      ],
    });

    new StatefulSet(this, "mariadb", {
      metadata: {
        namespace,
        name: "mariadb",
      },

      service: new Service(this, "mariadb-svc", {
        ports: [{ port: 3306, targetPort: 3306, name: "mariadb" }],
        type: ServiceType.CLUSTER_IP,
        metadata: {
          name: "mariadb",
          namespace,
        },
      }),

      replicas: 1,
      terminationGracePeriod: Duration.seconds(10),
      containers: [
        {
          name: "mariadb",
          image: "kochie/bigcapital-mariadb:latest",
          ports: [{ number: 3306, name: "mariadb" }],
          volumeMounts: [{ path: "/var/lib/mysql", volume: mariadbVolume }],
          securityContext: {
            readOnlyRootFilesystem: false,
            ensureNonRoot: false,
          },
          // envVariables: {
          //   MARIADB_DATABASE: EnvValue.fromValue("bigcapital_system"),
          //   MARIADB_USER: EnvValue.fromValue("bigcapital"),
          //   MARIADB_PASSWORD: EnvValue.fromValue("bigcapital"),
          //   // // MYSQL_ROOT_PASSWORD: "bigcapital",
          //   MARIADB_ROOT_PASSWORD: EnvValue.fromValue("password1"),
          //   // "MARIADB_INITDB_SKIP_TZINFO": EnvValue.fromValue("1"),
          // },
          envFrom: [new EnvFrom(mariadbConfigMap)],
          resources: {
            cpu: {
              limit: Cpu.millis(1024),
            },
            memory: {
              limit: Size.mebibytes(512),
            },
          },
        },
      ],
    });

    new StatefulSet(this, "redis", {
      metadata: {
        namespace,
        name: "redis",
      },

      service: new Service(this, "redis-svc", {
        ports: [{ port: 6379, targetPort: 6379, name: "redis" }],
        type: ServiceType.CLUSTER_IP,
        metadata: {
          name: "redis",
          namespace,
        },
      }),

      replicas: 1,
      terminationGracePeriod: Duration.seconds(10),
      containers: [
        {
          name: "redis",
          image: "redis",
          ports: [{ number: 6379, name: "redis" }],
          volumeMounts: [{ path: "/data", volume: redisVolume }],
          securityContext: {
            readOnlyRootFilesystem: false,
            ensureNonRoot: false,
          },
          resources: {
            cpu: {
              limit: Cpu.millis(256),
            },
            memory: {
              limit: Size.mebibytes(128),
            },
          },
        },
      ],
    });

    new Job(this, "bigcapital-init", {
      metadata: {
        namespace,
      },
      containers: [
        {
          image: "kochie/bigcapital-migration:latest",
          envFrom: [new EnvFrom(serverConfigMap)],
          securityContext: {
            readOnlyRootFilesystem: false,
            ensureNonRoot: false,
          },
          resources: {
            cpu: {
              limit: Cpu.millis(256),
            },
            memory: {
              limit: Size.mebibytes(256),
            },
          },
        },
      ],
    });

    const deployment = new Deployment(this, "deployment", {
      metadata: {
        namespace,
      },
      replicas: 1,
      containers: [
        {
          name: "bigcapital-server",
          image: "kochie/bigcapital-server:latest",
          ports: [{ number: 3000 }],
          securityContext: {
            readOnlyRootFilesystem: false,
            ensureNonRoot: false,
          },
          envFrom: [new EnvFrom(serverConfigMap), new EnvFrom(secrets)],
          resources: {
            cpu: {
              limit: Cpu.millis(1024),
            },
            memory: {
              limit: Size.mebibytes(1024),
            },
          },
        },
        {
          name: "bigcapital-webapp",
          image: "kochie/bigcapital-webapp:latest",
          ports: [{ number: 80 }],
          securityContext: {
            readOnlyRootFilesystem: false,
            ensureNonRoot: false,
          },
          resources: {
            cpu: {
              limit: Cpu.millis(128),
            },
            memory: {
              limit: Size.mebibytes(128),
            },
          },
        },
      ],
    });

    new Service(this, "bigcapital-svc", {
      ports: [{ port: 80, targetPort: 80, name: "http" }],
      type: ServiceType.LOAD_BALANCER,
      // loadBalancerClass: "tailscale",
      metadata: {
        name: "bigcapital-frontend",
        namespace,
      },
      selector: deployment,
    });
  }
}

const app = new App();
new MyChart(app, "bigcapital");
app.synth();
