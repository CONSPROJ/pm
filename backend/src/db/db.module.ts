import { Global, Module } from '@nestjs/common';
import { Db } from './db.service';
@Global()
@Module({ providers: [Db], exports: [Db] })
export class DbModule {}
