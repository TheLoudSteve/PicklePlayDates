import { 
  UUID, 
  ISODateTime, 
  CourtType, 
  PhoneNumber, 
  URL, 
  BaseEntity, 
  DynamoDBKeys, 
  GSIKeys 
} from './common';

/**
 * Court entity as stored in DynamoDB
 */
export interface Court extends BaseEntity, DynamoDBKeys, GSIKeys {
  courtId: UUID;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  courtType: CourtType;
  numberOfCourts: number;
  isReservable: boolean;
  reservationInfo?: string;
  hoursOfOperation?: string;
  amenities?: string[];
  fees?: string;
  website?: URL;
  phone?: PhoneNumber;
  description?: string;
  submittedBy: UUID;
  submittedByName: string;
  approvedBy?: UUID;
  isApproved: boolean;
  isActive: boolean;
}

/**
 * Court for API responses (without DynamoDB internals)
 */
export interface CourtResponse extends BaseEntity {
  courtId: UUID;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  courtType: CourtType;
  numberOfCourts: number;
  isReservable: boolean;
  reservationInfo?: string;
  hoursOfOperation?: string;
  amenities?: string[];
  fees?: string;
  website?: URL;
  phone?: PhoneNumber;
  description?: string;
  submittedBy: UUID;
  submittedByName: string;
  approvedBy?: UUID;
  isApproved: boolean;
  isActive: boolean;
}

/**
 * Court summary for list views and game references
 */
export interface CourtSummary {
  courtId: UUID;
  name: string;
  address: string;
  city: string;
  state: string;
  courtType: CourtType;
  numberOfCourts: number;
  isReservable: boolean;
  latitude: number;
  longitude: number;
}

/**
 * Court location for map displays
 */
export interface CourtLocation {
  courtId: UUID;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  courtType: CourtType;
}