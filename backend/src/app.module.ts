import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { DocumentsModule } from './documents/documents.module';
import { RulesModule } from './rules/rules.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { InsightsModule } from './insights/insights.module';
import { LoansModule } from './loans/loans.module';
import { SavingsModule } from './savings/savings.module';
import { TwoFactorModule } from './two-factor/two-factor.module';
import { ForexModule } from './forex/forex.module';
import { GoalsModule } from './goals/goals.module';
import { RecurringModule } from './recurring/recurring.module';
import { BudgetsModule } from './budgets/budgets.module';
import { MortgagesModule } from './mortgages/mortgages.module';
import { StocksModule } from './stocks/stocks.module';
import { AlertsModule } from './alerts/alerts.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    DocumentsModule,
    RulesModule,
    DashboardModule,
    InsightsModule,
    LoansModule,
    SavingsModule,
    TwoFactorModule,
    ForexModule,
    GoalsModule,
    RecurringModule,
    BudgetsModule,
    MortgagesModule,
    StocksModule,
    AlertsModule,
    EmailModule,
  ],
  providers: [],
})
export class AppModule {}
